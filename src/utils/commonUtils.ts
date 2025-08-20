import { logger } from "../logger";
import { HttpResponse } from "./responses";

type Response<T> = { data: T; error: null } | { data: null; error: Error };

export async function tryCatch<T>(
    fn: () => Promise<T>,
    loggerFn: (message: string, error?: Error) => void = logger.error
): Promise<Response<T>> {
    try {
        const data = await fn();
        return { data, error: null };
    } catch (error) {
        // Create a standardized error object
        const err = createError(error);

        // Log the error message and context
        loggerFn(err.message, err);

        // Return standardized error response with a message
        return { data: null, error: err };
    }
}

function createError(error: unknown): Error {
    if (error instanceof HttpResponse) {
        const errorInfo = error.getErrorInfo();
        return new Error(errorInfo.data.error || 'Unknown HTTP error');
    }
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Generic retry function for any asynchronous operation
 * @param operation Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Delay between retries in milliseconds
 * @param loggerFn Optional function for logging retry attempts
 * @returns Promise that resolves with the operation result or rejects after max retries
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    retryDelay: number = 3000,
    loggerFn: (message: string, error?: any) => void = console.warn
): Promise<T> {
    let retries = 0;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            retries++;
            loggerFn(`Operation attempt ${retries} failed:`, error);

            if (retries >= maxRetries) {
                loggerFn(`Max retries (${maxRetries}) reached. Operation failed.`);
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}

/**
 * Send email with retry logic
 */
export async function sendEmailTemplateWithRetry(
    mailer: any,
    emailOptions: any,
    maxRetries: number = 5,
    retryDelay: number = 3000
): Promise<void> {
    return withRetry(
        () => mailer.sendTemplateEmail(emailOptions),
        maxRetries,
        retryDelay,
        (message, error) => console.warn(message, error)
    );
}

/**
 * Generates a unique referral ID using a combination of letters and numbers
 * @param length The length of the referral ID (default: 8)
 * @returns A unique referral ID string (e.g., "X7B2K9P4")
 */
export function generateReferralId(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    // Using Node.js crypto module for better randomness
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
        // Use modulo to map the random byte to a character in our charset
        const randomIndex = randomBytes[i] % chars.length;
        result += chars[randomIndex];
    }

    return result;
}

export function generateCryptoString(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}<>?';
    const charsetLength = charset.length;
  
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
  
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[bytes[i] % charsetLength];
    }
  
    return result;
  }
  



/**
 * Generates a unique transaction reference
 * @returns unique transaction reference
 */
export function generateTransactionReference(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TRX${timestamp}${random}`;
}

/**
 * Validates a Nigerian phone number
 * @param phoneNumber Nigerian phone number
 * @returns boolean indicating if phone number is valid
 */
export function validatePhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber) {
        return false;
    }
    // Remove any spaces or special characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    // Check if it starts with 0 or 234 and has correct length
    return /^(0|234)[789][01]\d{8}$/.test(cleaned);
}

/**
 * Formats a Nigerian phone number to international format
 * @param phoneNumber Nigerian phone number
 * @returns formatted phone number
 */
export function formatPhoneNumber(phoneNumber: string): string {
    if (!validatePhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number');
    }

    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        return `234${cleaned.slice(1)}`;
    }
    return cleaned;
}

/**
 * Masks an email address by showing only the first 3 characters of the local part
 * and the domain name. Example: "example@gmail.com" becomes "exa****@gmail.com"
 * 
 * @param email - The email address to mask
 * @returns The masked email address
 */
export const maskEmail = (email: string): string => {
    if (!email || !email.includes('@')) return email;

    const [localPart, domain] = email.split('@');

    if (localPart.length <= 3) {
        return `${localPart}****@${domain}`;
    }

    return `${localPart.slice(0, 3)}${'*'.repeat(4)}@${domain}`;
};


export const generateFixedLengthRandomNumber = (len: number): string => {
    if (len <= 0 || len > 16) {
        throw new Error('Length must be between 1 and 16');
    }

    let result = '';
    for (let i = 0; i < len; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
};


type AnyObject = Record<string, any>

export function deepFlatten(obj: AnyObject): AnyObject {
    const result: AnyObject = {}

    function walk(current: AnyObject) {
        for (const [key, value] of Object.entries(current)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                walk(value)
            } else {
                result[key] = value
            }
        }
    }

    walk(obj)
    return result
}

export type WithdrawalOptions = {
    waiveFlatFeeBelow?: number;   // e.g. 2000
    flatFee?: number;             // e.g. 100
    percentFee?: number;          // e.g. 0.002
    maxFee?: number;              // e.g. 2000
};

export function calculateWithdrawalReceivedAmount(
    withdrawalAmount: number,
    _options: WithdrawalOptions = {
        flatFee: 100,
        percentFee: 0.002,
        maxFee: 2000,
        waiveFlatFeeBelow: 2000,
    }
): number {
    const { flatFee, maxFee, percentFee, waiveFlatFeeBelow } = _options

    const feeFromPercent = withdrawalAmount * percentFee;

    const applyFlatFee = withdrawalAmount >= waiveFlatFeeBelow;
    const totalFee = Math.min(
        feeFromPercent + (applyFlatFee ? flatFee : 0),
        maxFee
    );
    const receivedAmount = Math.max(0, withdrawalAmount - totalFee);
    return Number(receivedAmount.toFixed(2));
}
