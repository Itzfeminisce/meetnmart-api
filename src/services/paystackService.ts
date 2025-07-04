import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  PaystackConfig,
  PaystackTransferWrapperOptions,
  PaystackApiResponse,
  PaystackError,
  PaystackSuccess,
  CreateRecipientRequest,
  CreateRecipientResponse,
  TransferRecipient,
  BulkRecipientRequest,
  ListRecipientsQuery,
  UpdateRecipientRequest,
  CreateTransferRequest,
  CreateTransferResponse,
  Transfer,
  BulkTransferRequest,
  BulkTransferResponse,
  FinalizeTransferRequest,
  ListTransfersQuery,
  ResendOTPRequest,
  FinalizeDisableOTPRequest,
  BalanceResponse,
  WalletTransferRequest,
  WalletTransferResponse,
  BulkWalletTransfer,
  Currency,
  TransferSource,
  AmountInKobo,
  AmountInNaira,
  TransferStatus
} from './types';
import { getEnvVar } from '../utils/env';

export class PaystackTransferWrapper {
  private client: AxiosInstance;
  private secretKey: string;

  constructor(
    secretKey: string = getEnvVar("PAYSTACK_SECRET_KEY"),
    isProduction: boolean = false,
    options: PaystackTransferWrapperOptions = {}
  ) {
    this.secretKey = secretKey;

    this.client = axios.create({
      baseURL: 'https://api.paystack.co',
      timeout: options.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for retries if specified
    if (options.retries && options.retries > 0) {
      this.setupRetryInterceptor(options.retries, options.retryDelay || 1000);
    }
  }

  /**
   * Create a transfer recipient
   */
  async createRecipient(recipientData: CreateRecipientRequest): Promise<CreateRecipientResponse> {
    try {
      const response = await this.client.post<PaystackSuccess<TransferRecipient>>(
        '/transferrecipient',
        recipientData
      );

      return response.data
    } catch (error) {
      return this.handleError('Create Recipient', error);
    }
  }

  /**
   * Create multiple transfer recipients in batch
   */
  async createBulkRecipients(recipients: CreateRecipientRequest[]): Promise<PaystackApiResponse<TransferRecipient[]>> {
    try {
      const response = await this.client.post<PaystackApiResponse<TransferRecipient[]>>(
        '/transferrecipient/bulk',
        { batch: recipients }
      );

      return response.data
    } catch (error) {
      return this.handleError('Create Bulk Recipients', error);
    }
  }

  /**
   * List transfer recipients
   */
  async listRecipients(options: ListRecipientsQuery = {}): Promise<PaystackApiResponse<TransferRecipient[]>> {
    try {
      const response = await this.client.get<PaystackApiResponse<TransferRecipient[]>>(
        '/transferrecipient',
        { params: options }
      );

      return response.data
    } catch (error) {
      return this.handleError('List Recipients', error);
    }
  }

  /**
   * Fetch a single transfer recipient
   */
  async fetchRecipient(idOrCode: string): Promise<PaystackApiResponse<TransferRecipient>> {
    try {
      const response = await this.client.get<PaystackApiResponse<TransferRecipient>>(
        `/transferrecipient/${idOrCode}`
      );

      return response.data
    } catch (error) {
      return this.handleError('Fetch Recipient', error);
    }
  }

  /**
   * Update transfer recipient
   */
  async updateRecipient(
    idOrCode: string,
    updateData: UpdateRecipientRequest
  ): Promise<PaystackApiResponse<TransferRecipient>> {
    try {
      const response = await this.client.put<PaystackApiResponse<TransferRecipient>>(
        `/transferrecipient/${idOrCode}`,
        updateData
      );

      return response.data
    } catch (error) {
      return this.handleError('Update Recipient', error);
    }
  }

  /**
   * Delete transfer recipient
   */
  async deleteRecipient(idOrCode: string): Promise<PaystackApiResponse<{ message: string }>> {
    try {
      const response = await this.client.delete<PaystackApiResponse<{ message: string }>>(
        `/transferrecipient/${idOrCode}`
      );

      return response.data
    } catch (error) {
      return this.handleError('Delete Recipient', error);
    }
  }

  /**
   * Initiate a single transfer
   */
  async initiateTransfer(transferData: CreateTransferRequest): Promise<CreateTransferResponse> {
    try {
      // Ensure amount is in subunits (kobo for NGN)
      const payload: CreateTransferRequest = {
        ...transferData,
        amount: Math.round(transferData.amount * 100), // Convert to kobo
      };

      const response = await this.client.post<PaystackApiResponse<Transfer>>(
        '/transfer',
        payload
      );

      return response.data
    } catch (error) {
      return this.handleError('Initiate Transfer', error);
    }
  }

  /**
   * Initiate bulk transfers
   */
  async initiateBulkTransfer(
    transfers: Array<{
      amount: AmountInNaira;
      recipient: string;
      reason?: string;
      reference?: string;
      metadata?: Record<string, any>;
    }>,
    source: TransferSource = 'balance'
  ): Promise<PaystackApiResponse<BulkTransferResponse>> {
    try {
      // Process transfers to ensure amounts are in subunits
      const processedTransfers = transfers.map(transfer => ({
        ...transfer,
        amount: Math.round(transfer.amount * 100), // Convert to kobo
        source: source
      }));

      const response = await this.client.post<PaystackApiResponse<BulkTransferResponse>>(
        '/transfer/bulk',
        {
          currency: 'NGN' as Currency,
          source,
          transfers: processedTransfers
        }
      );

      return response.data
    } catch (error) {
      return this.handleError('Initiate Bulk Transfer', error);
    }
  }

  /**
   * Finalize transfer (for OTP-enabled transfers)
   */
  async finalizeTransfer(transferCode: string, otp: string): Promise<PaystackApiResponse<Transfer>> {
    try {
      const response = await this.client.post<PaystackApiResponse<Transfer>>(
        '/transfer/finalize_transfer',
        {
          transfer_code: transferCode,
          otp
        }
      );

      return response.data
    } catch (error) {
      return this.handleError('Finalize Transfer', error);
    }
  }

  /**
   * List transfers
   */
  async listTransfers(options: ListTransfersQuery = {}): Promise<PaystackApiResponse<Transfer[]>> {
    try {
      const response = await this.client.get<PaystackApiResponse<Transfer[]>>(
        '/transfer',
        { params: options }
      );

      return response.data
    } catch (error) {
      return this.handleError('List Transfers', error);
    }
  }

  /**
   * Fetch a single transfer
   */
  async fetchTransfer(idOrCode: string): Promise<PaystackApiResponse<Transfer>> {
    try {
      const response = await this.client.get<PaystackApiResponse<Transfer>>(
        `/transfer/${idOrCode}`
      );

      return response.data
    } catch (error) {
      return this.handleError('Fetch Transfer', error);
    }
  }

  /**
   * Verify transfer
   */
  async verifyTransfer(reference: string): Promise<PaystackApiResponse<Transfer>> {
    try {
      const response = await this.client.get<PaystackApiResponse<Transfer>>(
        `/transfer/verify/${reference}`
      );

      return response.data
    } catch (error) {
      return this.handleError('Verify Transfer', error);
    }
  }

  /**
   * Resend OTP for transfer
   */
  async resendOTP(
    transferCode: string,
    reason: 'resend_otp' | 'transfer' = 'resend_otp'
  ): Promise<PaystackApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post<PaystackApiResponse<{ message: string }>>(
        '/transfer/resend_otp',
        {
          transfer_code: transferCode,
          reason
        }
      );

      return response.data
    } catch (error) {
      return this.handleError('Resend OTP', error);
    }
  }

  /**
   * Disable OTP requirement for transfers
   */
  async disableOTP(): Promise<PaystackApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post<PaystackApiResponse<{ message: string }>>(
        '/transfer/disable_otp'
      );

      return response.data
    } catch (error) {
      return this.handleError('Disable OTP', error);
    }
  }

  /**
   * Enable OTP requirement for transfers
   */
  async enableOTP(): Promise<PaystackApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post<PaystackApiResponse<{ message: string }>>(
        '/transfer/enable_otp'
      );

      return response.data
    } catch (error) {
      return this.handleError('Enable OTP', error);
    }
  }

  /**
   * Finalize disable OTP request
   */
  async finalizeDisableOTP(otp: string): Promise<PaystackApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post<PaystackApiResponse<{ message: string }>>(
        '/transfer/disable_otp_finalize',
        { otp }
      );

      return response.data
    } catch (error) {
      return this.handleError('Finalize Disable OTP', error);
    }
  }

  /**
   * Get available balance
   */
  async getBalance(): Promise<BalanceResponse> {
    try {
      const response = await this.client.get<BalanceResponse>('/balance');

      return response.data
    } catch (error) {
      return this.handleError('Get Balance', error);
    }
  }

  /**
   * Wallet-specific helper: Transfer from wallet to bank account
   */
  async walletToBank(request: WalletTransferRequest): Promise<WalletTransferResponse> {
    try {
      const transferReference = request.reference || `wallet_${request.walletUserId}_${Date.now()}`;

      const transferResult = await this.initiateTransfer({
        source: 'balance',
        amount: request.amount, // Method handles conversion to kobo
        recipient: request.recipientCode,
        reason: request.reason || `Wallet withdrawal for user ${request.walletUserId}`,
        reference: transferReference,
        metadata: {
          wallet_user_id: request.walletUserId,
          transfer_type: 'wallet_withdrawal'
        }
      });

      if (!transferResult.success) {
        return transferResult;
      }

      return {
        ...transferResult,
        wallet_context: {
          user_id: request.walletUserId,
          original_amount: request.amount,
          reference: transferReference
        }
      };
    } catch (error) {
      return this.handleError('Wallet to Bank Transfer', error);
    }
  }

  /**
   * Wallet-specific helper: Bulk transfer from wallet
   */
  async bulkWalletTransfers(walletTransfers: BulkWalletTransfer[]): Promise<PaystackApiResponse<BulkTransferResponse>> {
    try {
      const transfers = walletTransfers.map((transfer, index) => ({
        amount: transfer.amount,
        recipient: transfer.recipientCode,
        reason: transfer.reason || `Wallet transfer ${index + 1}`,
        reference: transfer.reference || `bulk_wallet_${Date.now()}_${index}`,
        metadata: {
          wallet_user_id: transfer.walletUserId,
          transfer_type: 'bulk_wallet_transfer'
        }
      }));

      return await this.initiateBulkTransfer(transfers);
    } catch (error) {
      return this.handleError('Bulk Wallet Transfers', error);
    }
  }

  /**
   * List banks available for recipient creation.
   * @param country The country to list banks for (default: 'nigeria')
   * @returns PaystackApiResponse with list of banks
   */
  async listBanks(country: string = 'nigeria'): Promise<PaystackApiResponse<any>> {
    try {
      const response = await this.client.get<PaystackApiResponse<any>>(
        `/bank?country=${encodeURIComponent(country)}`
      );
      return response.data;
    } catch (error) {
      return this.handleError('List Banks', error);
    }
  }

  /**
   * Helper method to handle errors consistently
   */
  private handleError(operation: string, error: any): PaystackError {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError.response?.data as { message?: string })?.message || axiosError.message || 'Unknown error';
    const errorCode = axiosError.response?.status;

    console.error(`${operation} Error:`, {
      message: errorMessage,
      status: errorCode,
      data: axiosError.response?.data
    });

    return {
      success: false,
      error: errorMessage,
      status_code: errorCode,
      operation,
      raw_error: axiosError.response?.data || axiosError.message
    };
  }

  /**
   * Setup retry interceptor for network resilience
   */
  private setupRetryInterceptor(retries: number, delay: number): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;

        if (!config || !config.retry) {
          config.retry = 0;
        }

        if (config.retry >= retries) {
          return Promise.reject(error);
        }

        config.retry += 1;

        // Only retry on network errors or 5xx status codes
        if (
          error.code === 'ECONNABORTED' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNRESET' ||
          (error.response && error.response.status >= 500)
        ) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Helper method to convert amount to kobo (for NGN)
   */
  static toKobo(amount: AmountInNaira): AmountInKobo {
    return Math.round(amount * 100);
  }

  /**
   * Helper method to convert amount from kobo to naira
   */
  static fromKobo(amount: AmountInKobo): AmountInNaira {
    return amount / 100;
  }

  /**
   * Validate transfer amount
   */
  static validateAmount(amount: number): boolean {
    return amount > 0 && Number.isFinite(amount) && amount >= 0.01;
  }

  /**
   * Validate recipient code format
   */
  static validateRecipientCode(code: string): boolean {
    return /^RCP_[a-zA-Z0-9]+$/.test(code);
  }

  /**
   * Generate unique reference
   */
  static generateReference(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
  }
}

export default PaystackTransferWrapper;