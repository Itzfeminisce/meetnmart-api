import { ErrorRequestHandler } from 'express';
import { logger } from "../logger";
import { HttpResponse, Unknown} from "../utils/responses";
import { getEnvVar } from 'src/utils/env';

interface ErrorResponse {
  success: false;
  error: string;
  requestId?: string;
  stack?: string;
  timestamp: string;
  path: string;
  method: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res) => {
  // Cache environment and extract common properties
  const isProd = getEnvVar("NODE_ENV") === 'production';
  const { originalUrl, method, ip, headers } = req;
  const statusCode = err instanceof HttpResponse ? err.statusCode : 500;
  const requestId = headers["x-request-id"] as string || generateRequestId();

  // Create context object once
  const context = {
    message: err.message,
    requestId,
    url: originalUrl, 
    method,
    statusCode,
    stack: err.stack,
    clientIp: ip,
    userAgent: headers["user-agent"]
  };

  // Log error with context
  logger.error(`Request Error`, err, context);

  // Build error response reusing context
  const errorResponse: ErrorResponse = {
    success: false,
    error: err.message,
    requestId,
    timestamp: new Date().toISOString(),
    path: originalUrl,
    method,
  };

  // Only include stack trace in non-prod
  if (!isProd) {
    errorResponse.stack = err.stack;
  }

  new Unknown(statusCode, errorResponse).send(res);
};

// Helper function to generate a request ID if not provided
const generateRequestId = (): string => {
  return `req-${Math.random().toString(36).substr(2, 9)}`;
};
