import { Response } from "express";
import { logger } from "src/logger";

// Define response status codes and their meanings
export enum ResponseStatus {
  SUCCESS = "success",
  ERROR = "error",
  PENDING = "pending"
}

// Define standard response structure
interface ApiResponse<T = any> {
  status: ResponseStatus;
  statusCode: number;
  message: string;
  data?: T;
  code?: string;
  error?: {
    code: string;
    details?: any;
  };
}

interface ErrorInfo {
  data: any;
  statusCode: number;
  code?: string;
}

// First, let's update our ERROR_CODES to include all error types
const ERROR_CODES = {
  // System Errors
  NETWORK: 'ERR_NETWORK',
  TIMEOUT: 'ERR_TIMEOUT',
  SERVER: 'ERR_SERVER',
  UNKNOWN: 'ERR_UNKNOWN',

  // Authentication/Authorization Errors
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  FORBIDDEN: 'ERR_FORBIDDEN',

  // Resource Errors
  NOT_FOUND: 'ERR_NOT_FOUND',
  BAD_REQUEST: 'ERR_BAD_REQUEST',
  DUPLICATE_ENTRY: 'ERR_DUPLICATE_ENTRY',
  FOREIGN_KEY_VIOLATION: 'ERR_FOREIGN_KEY_VIOLATION',
  VALIDATION: 'ERR_VALIDATION',

  // Transaction Errors
  TRANSACTION: 'ERR_TRANSACTION',
  DUPLICATE_TRANSACTION: 'ERR_DUPLICATE_TRANSACTION',
  INSUFFICIENT_FUNDS: 'ERR_INSUFFICIENT_FUNDS',
  PAYMENT_FAILED: 'ERR_PAYMENT_FAILED',
  TRANSACTION_EXPIRED: 'ERR_TRANSACTION_EXPIRED',
  TRANSACTION_CANCELLED: 'ERR_TRANSACTION_CANCELLED',
  TRANSACTION_PENDING: 'ERR_TRANSACTION_PENDING',
  TRANSACTION_VERIFICATION_FAILED: 'ERR_TRANSACTION_VERIFICATION_FAILED',
  TRANSACTION_NOT_FOUND: 'ERR_TRANSACTION_NOT_FOUND',

  // Subscription Based Error
  // Subscription Based Errors
  SUBSCRIPTION_EXPIRED: 'ERR_SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_REQUIRED: 'ERR_SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_LIMIT_REACHED: 'ERR_SUBSCRIPTION_LIMIT_REACHED',
  SUBSCRIPTION_DOWNGRADE_FAILED: 'ERR_SUBSCRIPTION_DOWNGRADE_FAILED',
  SUBSCRIPTION_UPGRADE_FAILED: 'ERR_SUBSCRIPTION_UPGRADE_FAILED',
  SUBSCRIPTION_PAYMENT_FAILED: 'ERR_SUBSCRIPTION_PAYMENT_FAILED',
  SUBSCRIPTION_ALREADY_EXISTS: 'ERR_SUBSCRIPTION_ALREADY_EXISTS',
  SUBSCRIPTION_CANCELLATION_FAILED: 'ERR_SUBSCRIPTION_CANCELLATION_FAILED',
  SUBSCRIPTION_RENEWAL_FAILED: 'ERR_SUBSCRIPTION_RENEWAL_FAILED',
  SUBSCRIPTION_FEATURE_UNAVAILABLE: 'ERR_SUBSCRIPTION_FEATURE_UNAVAILABLE',
  SUBSCRIPTION_PLAN_NOT_FOUND: 'ERR_SUBSCRIPTION_PLAN_NOT_FOUND',
  SUBSCRIPTION_TIER_CHANGE_FAILED: 'ERR_SUBSCRIPTION_TIER_CHANGE_FAILED',
  SUBSCRIPTION_UPGRADE_REQUIRED: 'ERR_SUBSCRIPTION_UPGRADE_REQUIRED',

  // Referral Errors
  REFERRAL_CODE_INVALID: 'ERR_REFERRAL_CODE_INVALID',
  REFERRAL_CODE_ALREADY_USED: 'ERR_REFERRAL_CODE_ALREADY_USED',
  REFERRAL_CODE_NOT_FOUND: 'ERR_REFERRAL_CODE_NOT_FOUND',
  REFERRAL_CODE_EXPIRED: 'ERR_REFERRAL_CODE_EXPIRED',
  REFERRAL_CODE_LIMIT_REACHED: 'ERR_REFERRAL_CODE_LIMIT_REACHED',
  REFERRAL_CODE_INVALID_USE: 'ERR_REFERRAL_CODE_INVALID_USE',
  CIRCULAR_REFERRAL_NOT_ALLOWED: 'ERR_CIRCULAR_REFERRAL_NOT_ALLOWED',

  // BVN
  BVN_MISSING: 'ERR_BVN_MISSING'
} as const;

export abstract class HttpResponse {
  public statusCode: number;
  private responseBody: ApiResponse;
  private headers: Record<string, string> = {};

  constructor(statusCode: number = 200, data: any = null, message: string = '') {
    this.statusCode = statusCode;
    this.responseBody = {
      status: this.getResponseStatus(statusCode),
      statusCode,
      message,
      data
    };
  }

  private getResponseStatus(statusCode: number): ResponseStatus {
    if (statusCode >= 200 && statusCode < 300) return ResponseStatus.SUCCESS;
    if (statusCode === 202) return ResponseStatus.PENDING;
    return ResponseStatus.ERROR;
  }

  public getErrorInfo(): ErrorInfo {
    return {
      data: this.responseBody.data,
      statusCode: this.statusCode,
      code: this.responseBody.error?.code
    };
  }

  public withErrorCode(code: string): this {
    if (this.responseBody.status === ResponseStatus.ERROR) {
      this.responseBody.error = {
        code,
        details: this.responseBody.data
      };
    }
    return this;
  }

  public withMessage(message: string): this {
    this.responseBody.message = message;
    return this;
  }

  public withHeader(key: string, value: string): this {
    this.headers[key] = value;
    return this;
  }

  public send(res: Response): Response {
    res.status(this.statusCode);

    Object.entries(this.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.json(this.responseBody);
  }
}

// Success Responses
export class Ok extends HttpResponse {
  constructor(data?: any, message: string = 'Operation successful') {
    super(200, data, message);
  }
}

export class Created extends HttpResponse {
  constructor(data?: any, message: string = 'Resource created successfully') {
    super(201, data, message);
  }
}

export class NoContent extends HttpResponse {
  constructor(message: string = 'No content') {
    super(204, null, message);
  }
}

// Error Responses
export class BadRequest extends HttpResponse {
  constructor(data?: any, message: string = 'Bad request') {
    super(400, data, message);
    this.withErrorCode(ERROR_CODES.BAD_REQUEST);
  }
}

export class Unauthorized extends HttpResponse {
  constructor(message: string = 'Unauthorized access') {
    super(401, null, message);
    this.withErrorCode(ERROR_CODES.UNAUTHORIZED);
  }
}

export class Forbidden extends HttpResponse {
  constructor(message: string = 'Access forbidden') {
    super(403, null, message);
    this.withErrorCode(ERROR_CODES.FORBIDDEN);
  }
}

export class NotFound extends HttpResponse {
  constructor(message: string = 'Resource not found') {
    super(404, null, message);
    this.withErrorCode(ERROR_CODES.NOT_FOUND);
  }
}

export class InternalServerError extends HttpResponse {
  constructor(data?: any, message: string = 'Internal server error') {
    super(500, null, message);
    this.withErrorCode(ERROR_CODES.SERVER);
  }
}

export class TooManyRequests extends HttpResponse {
  constructor(message: string = 'Too Many Requests') {
    super(429, { message });
  }
}

export class Unknown extends HttpResponse {
  constructor(statusCode: number, data?: any) {
    super(statusCode, {
      error: data
    });
  }
}

// Add Transaction-specific response classes
export class TransactionError extends HttpResponse {
  constructor(code: keyof typeof ERROR_CODES, message: string, details?: any) {
    super(422, details, message);
    this.withErrorCode(ERROR_CODES[code]);
  }
}


export class PaymentError extends HttpResponse {
  constructor(code: keyof typeof ERROR_CODES, message: string, details?: any) {
    super(402, details, message);
    this.withErrorCode(ERROR_CODES[code]);
  }
}

export class TransactionPending extends HttpResponse {
  constructor(data?: any, message: string = 'Transaction is being processed') {
    super(202, data, message);
    this.withErrorCode(ERROR_CODES.TRANSACTION_PENDING);
  }
}

export class ReferralError extends HttpResponse {
  constructor(code: keyof typeof ERROR_CODES, message: string, details?: any) {
    super(422, details, message);
    this.withErrorCode(ERROR_CODES[code]);
  }
}

export class BvnMissingError extends HttpResponse {
  constructor(message: string, details?: any) {
    super(422, details, message);
    this.withErrorCode(ERROR_CODES.BVN_MISSING);
  }
}

// Enhanced error handler with transaction-specific error handling
export const handleError = (error: HttpResponse | Error | unknown, context?: string): HttpResponse => {
  logger.error("Error occurred", error as any, {
    stack: error instanceof Error ? error.stack : undefined,
    context
  });

  // Handle existing HttpResponse instances
  if (error instanceof HttpResponse) {
    return error;
  }

  // Handle network errors
  if (error instanceof Error && error.message.includes('network')) {
    return new BadRequest(null, 'Network error occurred')
      .withErrorCode(ERROR_CODES.NETWORK);
  }

  // Handle timeout errors
  if (error instanceof Error && (
    error.message.includes('timeout') || 
    error.message.includes('ECONNABORTED')
  )) {
    return new BadRequest(null, 'Request timed out')
      .withErrorCode(ERROR_CODES.TIMEOUT);
  }


  // Handle transaction-specific errors
  if (error instanceof Error) {
    // Transaction verification failed
    if (error.message.includes('verification failed')) {
      return new TransactionError(
        'TRANSACTION_VERIFICATION_FAILED',
        'Transaction verification failed',
        { originalError: error.message }
      );
    }

    // Insufficient funds
    if (error.message.includes('insufficient funds')) {
      return new PaymentError(
        'INSUFFICIENT_FUNDS',
        'Insufficient funds for this transaction',
        { originalError: error.message }
      );
    }

    // Duplicate transaction
    if (error.message.includes('duplicate transaction')) {
      return new TransactionError(
        'DUPLICATE_TRANSACTION',
        'This transaction has already been processed',
        { originalError: error.message }
      );
    }

    // Expired transaction
    if (error.message.includes('expired')) {
      return new TransactionError(
        'TRANSACTION_EXPIRED',
        'This transaction has expired',
        { originalError: error.message }
      );
    }

    // Cancelled transaction
    if (error.message.includes('cancelled')) {
      return new TransactionError(
        'TRANSACTION_CANCELLED',
        'This transaction was cancelled',
        { originalError: error.message }
      );
    }

    // Payment failed
    if (error.message.includes('payment failed')) {
      return new PaymentError(
        'PAYMENT_FAILED',
        'Payment processing failed',
        { originalError: error.message }
      );
    }
  }

  // Handle MongoDB duplicate key errors
  if ((error as any)?.keyPattern) {
    const fieldName = Object.keys((error as any).keyPattern)[0] || 'field';
    return new BadRequest(
      { field: fieldName },
      `Duplicate ${fieldName} detected`
    ).withErrorCode(ERROR_CODES.DUPLICATE_ENTRY);
  }

  // Handle generic Error instances
  if (error instanceof Error) {
    return new BadRequest(error.message, 'Operation failed');
  }

  // Handle unknown errors
  return new InternalServerError(null, 'An unexpected error occurred')
    .withErrorCode(ERROR_CODES.UNKNOWN);
};

// Example usage for transaction errors:
/*
// For a failed payment:
new PaymentError(
  'PAYMENT_FAILED',
  'Payment processing failed',
  { transactionId: 'xyz', reason: 'card_declined' }
).send(res);

// For a pending transaction:
new TransactionPending(
  { transactionId: 'xyz' },
  'Payment is being processed'
).send(res);

// For transaction verification:
new TransactionError(
  'TRANSACTION_VERIFICATION_FAILED',
  'Could not verify transaction',
  { transactionId: 'xyz' }
).send(res);
*/

// Export error codes for frontend use
export const ErrorCodes = ERROR_CODES;

// Example usage:
/*
new Ok({ user })
  .withMessage('User profile updated successfully')
  .send(res);

new BadRequest({ field: 'email' })
  .withMessage('Invalid email format')
  .withErrorCode(ERROR_CODES.VALIDATION)
  .send(res);
*/