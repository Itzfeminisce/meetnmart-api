import { Request, Response, NextFunction } from 'express';
import { Ok, Unknown } from './responses';

/**
 * Error response structure
 */
interface ErrorResponse {
  success: false;
  message: string;
  error?: any;
  stack?: string;
}

/**
 * Success response structure
 */
interface SuccessResponse {
  success: true;
  data: any;
}

/**
 * Configuration options for the AsyncHandler
 */
interface AsyncHandlerOptions {
  /**
   * Whether to log requests and responses
   * @default true
   */
  enableLogging?: boolean;
  
  /**
   * Whether to include stack traces in error responses (dev mode)
   * @default process.env.NODE_ENV !== 'production'
   */
  includeErrorStack?: boolean;
  
  /**
   * Custom logger function (defaults to console)
   */
  logger?: {
    info: (message: string, ...meta: any[]) => void;
    error: (message: string, ...meta: any[]) => void;
  };
}

/**
 * Default options
 */
const defaultOptions: AsyncHandlerOptions = {
  enableLogging: true,
  includeErrorStack: process.env.NODE_ENV !== 'production',
  logger: console
};

/**
 * Creates an async handler wrapper with error handling and logging
 * 
 * @param handler - The async route handler function
 * @param options - Configuration options
 * @returns Express middleware function
 */
export const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<any>,
  options?: AsyncHandlerOptions
) => {
  // Merge provided options with defaults
  const config = { ...defaultOptions, ...options };
  const { enableLogging, includeErrorStack, logger } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Set requestId for tracking
    req.headers['x-request-id'] = requestId as string;
    
    // Log the incoming request
    if (enableLogging) {
      logger?.info(`[${requestId}] Request: ${req.method} ${req.originalUrl}`, {
        // headers: maskSensitiveHeaders(req.headers),
        query: req.query,
        body: "***************", //maskSensitiveData(req.body),
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    try {
      // Execute the handler
      const result = await handler(req, res, next);
      
      // If the response has already been sent, don't continue
      if (res.headersSent) {
        return;
      }

      const responseTime = Date.now() - startTime;
      
      // Send the response
      new Ok(result).send(res)
      
      // Log the response
      if (enableLogging) {
        logger?.info(`[${requestId}] Response: ${res.statusCode} (${responseTime}ms)`, {
          response: "*******************", // maskSensitiveData(result),
          responseTime,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      // Determine status code based on error
      const statusCode = determineStatusCode(error);
      
      // Build the error response
      const errorResponse: ErrorResponse = {
        success: false,
        message: error.message || 'Internal Server Error'
      };
      
      // Include original error in development
      if (includeErrorStack && error.stack) {
        errorResponse.stack = error.stack;
      }
      
      // Include additional error info if available
      if (error.errors) {
        errorResponse.error = error.errors;
      }
      
      // Log the error
      logger?.error(`[${requestId}] Error: ${statusCode} (${responseTime}ms)`, {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
          errors: error.errors
        },
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: maskSensitiveHeaders(req.headers),
          query: req.query,
          body: maskSensitiveData(req.body)
        },
        responseTime,
        timestamp: new Date().toISOString()
      });
      
      new Unknown(statusCode, errorResponse).send(res)
    }
  };
};

/**
 * Determine appropriate HTTP status code from error
 */
function determineStatusCode(error: any): number {
  // Check for common error types and set appropriate status codes
  if (error.name === 'ValidationError') {
    return 400; // Bad Request
  }
  
  if (error.name === 'UnauthorizedError' || error.message?.toLowerCase().includes('unauthorized')) {
    return 401; // Unauthorized
  }
  
  if (error.name === 'ForbiddenError' || error.message?.toLowerCase().includes('forbidden')) {
    return 403; // Forbidden
  }
  
  if (error.name === 'NotFoundError' || error.message?.toLowerCase().includes('not found')) {
    return 404; // Not Found
  }
  
  if (error.name === 'ConflictError' || error.code === 11000) { // MongoDB duplicate key error
    return 409; // Conflict
  }
  
  if (error.name === 'RateLimitError') {
    return 429; // Too Many Requests
  }
  
  // Custom status code if specified
  if (error.statusCode && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  
  return 500; // Default to Internal Server Error
}

/**
 * Mask sensitive data in request/response objects
 */
function maskSensitiveData(data: any): any {
  if (!data) return data;
  
  // Clone the data to avoid modifying the original
  const masked = JSON.parse(JSON.stringify(data));
  
  // List of sensitive field names to mask
  const sensitiveFields = [
    'password', 'newPassword', 'oldPassword', 'confirmPassword',
    'token', 'accessToken', 'refreshToken', 'apiKey', 'secret',
    'pin', 'cvv', 'cardNumber', 'ssn', 'socialSecurityNumber'
  ];
  
  // Recursively mask sensitive data
  function recursiveMask(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      // Check if this is a sensitive field
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        if (typeof obj[key] === 'string') {
          const length = obj[key].length;
          obj[key] = length > 0 ? '********' : '';
        } else if (obj[key] !== null && obj[key] !== undefined) {
          obj[key] = '********';
        }
      } 
      // Recurse if object or array
      else if (obj[key] && typeof obj[key] === 'object') {
        recursiveMask(obj[key]);
      }
    });
  }
  
  recursiveMask(masked);
  return masked;
}

/**
 * Mask sensitive headers
 */
function maskSensitiveHeaders(headers: any): any {
  if (!headers) return headers;
  
  // Clone the headers
  const masked = { ...headers };
  
  // List of sensitive header names
  const sensitiveHeaders = [
    'authorization', 'x-api-key', 'cookie', 'set-cookie',
    'x-auth-token', 'token', 'api-key', 'secret'
  ];
  
  // Mask sensitive headers
  Object.keys(masked).forEach(key => {
    if (sensitiveHeaders.some(header => key.toLowerCase().includes(header.toLowerCase()))) {
      if (typeof masked[key] === 'string') {
        // Show auth type but mask the token
        if (key.toLowerCase() === 'authorization' && masked[key].includes(' ')) {
          const parts = masked[key].split(' ');
          masked[key] = `${parts[0]} ********`;
        } else {
          masked[key] = '********';
        }
      } else if (Array.isArray(masked[key])) {
        masked[key] = masked[key].map(() => '********');
      }
    }
  });
  
  return masked;
}


/**
 * Usage example:
 * 
 * // Import the asyncHandler
 * import { asyncHandler, NotFoundError } from './asyncHandler';
 *
 * // Use in your routes
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await User.findById(req.params.id);
 *   
 *   if (!user) {
 *     throw new NotFoundError('User not found');
 *   }
 *   
 *   return user; // Will be wrapped in { success: true, data: user }
 * }));
 */