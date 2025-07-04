// Types for Paystack Transfer API

export type Currency = 'NGN' | 'GHS' | 'ZAR' | 'KES' | 'USD';

export type RecipientType = 'nuban' | 'mobile_money' | 'basa' | 'authorization';

export type TransferStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'reversed'
  | 'otp'
  | 'queued'
  | 'processing';

export type TransferSource = 'balance';

// Base API Response Structure
export interface PaystackResponse<T = any> {
  status: boolean;
  message: string;
  data: T;
  meta?: {
    total: number;
    skipped: number;
    perPage: number;
    page: number;
    pageCount: number;
  };
}

// Error Response
export interface PaystackError {
  success: false;
  error: string;
  status_code?: number;
  operation: string;
  raw_error?: any;
}

// Success Response
export interface PaystackSuccess<T = any> {
  success: true;
  data: PaystackResponse<T>;
}

// Union type for API responses
export type PaystackApiResponse<T = any> = PaystackSuccess<T> | PaystackError;

// Transfer Recipient Types
export interface CreateRecipientRequest {
  type: RecipientType;
  name: string;
  account_number: string;
  bank_code: string;
  currency?: Currency;
  description?: string;
  metadata?: Record<string, any>;
}

export interface RecipientDetails {
  authorization_code?: string;
  account_number: string;
  account_name: string;
  bank_code: string;
  bank_name: string;
}

export interface TransferRecipient {
  active: boolean;
  createdAt: string;
  currency: Currency;
  description?: string;
  domain: string;
  email?: string;
  id: number;
  integration: number;
  metadata?: Record<string, any>;
  name: string;
  recipient_code: string;
  type: RecipientType;
  updatedAt: string;
  is_deleted: boolean;
  details: RecipientDetails;
}

// Fix: Use a type instead of interface extension for union types
export type CreateRecipientResponse = PaystackApiResponse<TransferRecipient> & {
  recipient_code?: string;
};

export interface BulkRecipientRequest {
  batch: CreateRecipientRequest[];
}

export interface ListRecipientsQuery {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}

export interface UpdateRecipientRequest {
  name?: string;
  email?: string;
  description?: string;
  metadata?: Record<string, any>;
}

// Transfer Types
export interface CreateTransferRequest {
  source: TransferSource;
  amount: number; // Amount in subunits (kobo, pesewas, cents)
  recipient: string; // Recipient code
  reason?: string;
  currency?: Currency;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface Transfer {
  id: number;
  domain: string;
  amount: number; // Amount in subunits
  currency: Currency;
  source: TransferSource;
  reason?: string;
  recipient: TransferRecipient;
  status: TransferStatus;
  transfer_code: string;
  reference?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  session?: {
    provider: string;
    id: string;
  };
  failure_reason?: string;
  failures?: Array<{
    message: string;
    code: string;
  }>;
}

// Fix: Use a type instead of interface extension for union types
export type CreateTransferResponse = PaystackApiResponse<Transfer> & {
  transfer_code?: string;
  status?: TransferStatus;
};

export interface BulkTransferRequest {
  currency: Currency;
  source: TransferSource;
  transfers: Array<{
    amount: number;
    recipient: string;
    reason?: string;
    reference?: string;
    metadata?: Record<string, any>;
  }>;
}

export interface BulkTransferResponse {
  status: boolean;
  message: string;
  data: Array<{
    transfer_code: string;
    amount: number;
    recipient: string;
    status: TransferStatus;
    reference: string;
    reason?: string;
  }>;
}

export interface FinalizeTransferRequest {
  transfer_code: string;
  otp: string;
}

export interface ListTransfersQuery {
  perPage?: number;
  page?: number;
  status?: TransferStatus;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD;
  customer?: string;
  amount?: number;
}

export interface ResendOTPRequest {
  transfer_code: string;
  reason: 'resend_otp' | 'transfer';
}

export interface FinalizeDisableOTPRequest {
  otp: string;
}

// Balance Types
export interface Balance {
  currency: Currency;
  balance: number; // Amount in subunits
}

// Fix: Use a type instead of interface extension for union types
export type BalanceResponse = PaystackApiResponse<Balance[]>;

// Wallet-specific Types
export interface WalletTransferRequest {
  walletUserId: string;
  amount: number; // Amount in main units (naira, not kobo)
  recipientCode: string;
  reason?: string;
  reference?: string;
}

// Fix: Use a type instead of interface extension for union types
export type WalletTransferResponse = PaystackApiResponse<Transfer> & {
  transfer_code?: string;
  status?: TransferStatus;
  wallet_context?: {
    user_id: string;
    original_amount: number;
    reference: string;
  };
};

export interface BulkWalletTransfer {
  walletUserId: string;
  amount: number; // Amount in main units
  recipientCode: string;
  reason?: string;
  reference?: string;
}

export interface BankDetails {
  account_name: string;
  account_number: string;
  bank_code: string;
}

export interface WithdrawalRequest {
  amount: number; // Amount in main units (naira)
  bankDetails: BankDetails;
  reason?: string;
  reference?: string;
}

export interface WithdrawalResponse {
  success: boolean;
  requires_otp?: boolean;
  transfer_code?: string;
  status?: TransferStatus;
  reference?: string;
  message?: string;
  error?: string;
}

export interface OTPTransferRequest {
  transferCode: string;
  otp: string;
}

export interface BulkWithdrawalRequest {
  userId: string;
  amount: number;
  bankDetails: BankDetails;
  reason?: string;
  reference?: string;
}

export interface TransferStatusResponse {
  success: boolean;
  status?: TransferStatus;
  amount?: number; // Amount in main units
  recipient?: TransferRecipient;
  created_at?: string;
  updated_at?: string;
  error?: string;
}

export interface WalletBalanceResponse {
  success: boolean;
  balance?: number; // Amount in main units
  currency?: Currency;
  error?: string;
}

export interface RecentTransfersQuery {
  page?: number;
  perPage?: number;
}

export interface WalletTransferSummary {
  transfer_code: string;
  amount: number; // Amount in main units
  recipient: string;
  status: TransferStatus;
  reference?: string;
  reason?: string;
  created_at: string;
  wallet_user_id?: string;
}

export interface RecentTransfersResponse {
  success: boolean;
  transfers?: WalletTransferSummary[];
  pagination?: {
    total: number;
    skipped: number;
    perPage: number;
    page: number;
    pageCount: number;
  };
  error?: string;
}

// Webhook Types
export type WebhookEventType =
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed';

export interface WebhookEvent<T = any> {
  event: WebhookEventType;
  data: T;
}

export interface TransferWebhookData {
  transfer_code: string;
  amount: number; // Amount in subunits
  currency: Currency;
  recipient: {
    name: string;
    account_number: string;
    bank_name: string;
  };
  reference?: string;
  status: TransferStatus;
  failure_reason?: string;
  createdAt: string;
  updatedAt: string;
}

// Configuration Types
export interface PaystackConfig {
  secretKey: string;
  isProduction?: boolean;
  baseURL?: string;
}

// Utility Types
export type AmountInKobo = number;
export type AmountInNaira = number;

// Constructor options
export interface PaystackTransferWrapperOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// Enhanced error types
export interface PaystackValidationError extends PaystackError {
  field?: string;
  code?: string;
}

export interface PaystackNetworkError extends PaystackError {
  timeout?: boolean;
  connection_error?: boolean;
}

// Query builder types
export interface DateRange {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

export interface PaginationOptions {
  page?: number;
  perPage?: number;
}

export interface TransferFilters extends PaginationOptions, DateRange {
  status?: TransferStatus;
  customer?: string;
  amount?: number;
}

export interface RecipientFilters extends PaginationOptions, DateRange {
  type?: RecipientType;
  currency?: Currency;
}

// Type guards
export function isPaystackError(response: PaystackApiResponse): response is PaystackError {
  return !response.success;
}

export function isPaystackSuccess<T>(response: PaystackApiResponse<T>): response is PaystackSuccess<T> {
  return response.success;
}

export function isTransferWebhookEvent(event: WebhookEvent): event is WebhookEvent<TransferWebhookData> {
  return ['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event);
}

export enum WITHDRAWAL_STATUS {
  Pending = "pending",
  Cancelled = "canceled",
  Processing = "processing",
  Released = "released"
}