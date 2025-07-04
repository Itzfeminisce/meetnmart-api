import { cacheService } from '../utils/cacheUtils';
import { getEnvVar } from '../utils/env';
import PaystackTransferWrapper from './paystackService';
import {
  BankDetails,
  WithdrawalRequest,
  WithdrawalResponse,
  OTPTransferRequest,
  BulkWithdrawalRequest,
  TransferStatusResponse,
  WalletBalanceResponse,
  RecentTransfersQuery,
  RecentTransfersResponse,
  WalletTransferSummary,
  TransferRecipient,
  CreateRecipientRequest,
  PaystackApiResponse,
  TransferStatus,
  WebhookEvent,
  TransferWebhookData,
  isTransferWebhookEvent,
  isPaystackError,
  Currency
} from './types';

export interface WalletServiceConfig {
  paystackSecretKey?: string;
  isProduction?: boolean;
  defaultCurrency?: Currency;
  enableRetries?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

export interface RecipientCache {
  [key: string]: string; // account_number + bank_code -> recipient_code
}

export class WalletTransferService {
  private paystack: PaystackTransferWrapper;
  private recipientCache: RecipientCache = {};
  private defaultCurrency: Currency;

  constructor(config: WalletServiceConfig) {
    this.paystack = new PaystackTransferWrapper(
      config.paystackSecretKey,
      config.isProduction || false,
      {
        retries: config.enableRetries ? (config.retryCount || 3) : 0,
        retryDelay: config.retryDelay || 1000
      }
    );
    
    this.defaultCurrency = config.defaultCurrency || 'NGN';
  }

  /**
   * Process wallet withdrawal to bank account
   */
  async processWithdrawal(
    userId: string,
    withdrawalData: WithdrawalRequest
  ): Promise<WithdrawalResponse> {
    try {
      // Validate amount
      if (!PaystackTransferWrapper.validateAmount(withdrawalData.amount)) {
        return {
          success: false,
          error: 'Invalid amount. Amount must be greater than 0.01'
        };
      }

      // 1. First, create or get recipient
      const recipientResult = await this.getOrCreateRecipient(withdrawalData.bankDetails);
      
      if (!recipientResult.success) {
        return {
          success: false,
          error: `Failed to create recipient: ${recipientResult.error}`
        };
      }
      
      const recipientCode = recipientResult.recipient_code!;

      // 2. Initiate transfer
      const transferResult = await this.paystack.walletToBank({
        walletUserId: userId,
        amount: withdrawalData.amount,
        recipientCode: recipientCode,
        reason: withdrawalData.reason || 'Wallet withdrawal',
        reference: withdrawalData.reference || PaystackTransferWrapper.generateReference('WALLET')
      });


      if (!transferResult.success) {
        return {
          success: false,
          error: 'Transfer initiation failed'
        };
      }

      return {
        success: true,
        transfer_code: transferResult.transfer_code,
        status: transferResult.status,
        reference: transferResult.wallet_context?.reference,
        requires_otp: transferResult.status === 'otp',
        message: transferResult.status === 'otp' ? 'OTP required to complete transfer' : 'Transfer initiated successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Withdrawal processing failed'
      };
    }
  }

  /**
   * Complete OTP-required transfer
   */
  async completeOTPTransfer(otpRequest: OTPTransferRequest): Promise<WithdrawalResponse> {
    try {
      const result = await this.paystack.finalizeTransfer(otpRequest.transferCode, otpRequest.otp);
      
      if (!result.success) {
        return {
          success: false,
          message: 'OTP verification failed'
        };
      }

      return {
        success: true,
        transfer_code: otpRequest.transferCode,
        status: result.data.data?.status,
        message: 'Transfer completed successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'OTP completion failed'
      };
    }
  }

  /**
   * Process bulk withdrawals
   */
  async processBulkWithdrawals(withdrawals: BulkWithdrawalRequest[]): Promise<PaystackApiResponse<any>> {
    try {
      // Prepare bulk wallet transfers
      const bulkTransfers = [];
      
      for (const withdrawal of withdrawals) {
        if (!PaystackTransferWrapper.validateAmount(withdrawal.amount)) {
          return {
            success: false,
            error: `Invalid amount for user ${withdrawal.userId}: ${withdrawal.amount}`,
            operation: 'Bulk Withdrawals',
            status_code: 400
          };
        }

        const recipientResult = await this.getOrCreateRecipient(withdrawal.bankDetails);
        
        if (!recipientResult.success) {
          return {
            success: false,
            error: `Failed to create recipient for user ${withdrawal.userId}: ${recipientResult.error}`,
            operation: 'Bulk Withdrawals',
            status_code: 400
          };
        }

        bulkTransfers.push({
          walletUserId: withdrawal.userId,
          amount: withdrawal.amount,
          recipientCode: recipientResult.recipient_code!,
          reason: withdrawal.reason || 'Bulk wallet withdrawal',
          reference: withdrawal.reference || PaystackTransferWrapper.generateReference('BULK')
        });
      }

      return await this.paystack.bulkWalletTransfers(bulkTransfers);

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        operation: 'Bulk Withdrawals',
        status_code: 500
      };
    }
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(transferCodeOrReference: string): Promise<TransferStatusResponse> {
    try {
      const result = await this.paystack.fetchTransfer(transferCodeOrReference);
      
      if (!result.success) {
        return {
          success: false,
          error: "Get Transfer status failed"
        };
      }

      const transfer = result.data.data;
      
      return {
        success: true,
        status: transfer?.status,
        amount: transfer ? PaystackTransferWrapper.fromKobo(transfer.amount) : undefined,
        recipient: transfer?.recipient,
        created_at: transfer?.createdAt,
        updated_at: transfer?.updatedAt
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Verify transfer by reference
   */
  async verifyTransfer(reference: string): Promise<TransferStatusResponse> {
    try {
      const result = await this.paystack.verifyTransfer(reference);
      
      if (!result.success) {
        return {
          success: false,
          error: "Transfer verification failed"
        };
      }

      const transfer = result.data.data;
      
      return {
        success: true,
        status: transfer?.status,
        amount: transfer ? PaystackTransferWrapper.fromKobo(transfer.amount) : undefined,
        recipient: transfer?.recipient,
        created_at: transfer?.createdAt,
        updated_at: transfer?.updatedAt
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get wallet balance (from Paystack balance)
   */
  async getWalletBalance(): Promise<WalletBalanceResponse> {
    try {
      const result = await this.paystack.getBalance();
      
      if (!result.success) {
        return {
          success: false,
          error: "Failed to get wallet balance"
        };
      }

      // Find balance for default currency
      const balance = result.data.data?.find(b => b.currency === this.defaultCurrency);
      
      if (!balance) {
        return {
          success: false,
          error: `No balance found for currency ${this.defaultCurrency}`
        };
      }

      return {
        success: true,
        balance: PaystackTransferWrapper.fromKobo(balance.balance),
        currency: balance.currency
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get recent transfers with wallet context
   */
  async getRecentTransfers(query: RecentTransfersQuery = {}): Promise<RecentTransfersResponse> {
    try {
      const result = await this.paystack.listTransfers({
        page: query.page || 1,
        perPage: query.perPage || 20
      });
      
      if (!result.success) {
        return {
          success: false,
          error: "Failed to get recent transfers"
        };
      }

      const transfers: WalletTransferSummary[] = result.data.data?.map(transfer => ({
        transfer_code: transfer.transfer_code,
        amount: PaystackTransferWrapper.fromKobo(transfer.amount),
        recipient: transfer.recipient.name,
        status: transfer.status,
        reference: transfer.reference,
        reason: transfer.reason,
        created_at: transfer.createdAt,
        wallet_user_id: transfer.metadata?.wallet_user_id
      })) || [];

      return {
        success: true,
        transfers,
        pagination: result.data.meta ? {
          total: result.data.meta.total,
          skipped: result.data.meta.skipped,
          perPage: result.data.meta.perPage,
          page: result.data.meta.page,
          pageCount: result.data.meta.pageCount
        } : undefined
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Resend OTP for transfer
   */
  async resendTransferOTP(transferCode: string): Promise<PaystackApiResponse<{ message: string }>> {
    return await this.paystack.resendOTP(transferCode, 'resend_otp');
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    if (!isTransferWebhookEvent(event)) {
      return;
    }

    const { data } = event;
    
    // Log webhook event for processing
    console.log(`Transfer webhook received: ${event.event}`, {
      transfer_code: data.transfer_code,
      status: data.status,
      amount: PaystackTransferWrapper.fromKobo(data.amount),
      reference: data.reference
    });

    // Here you can implement custom logic for each webhook event
    switch (event.event) {
      case 'transfer.success':
        await this.handleTransferSuccess(data);
        break;
      case 'transfer.failed':
        await this.handleTransferFailed(data);
        break;
      case 'transfer.reversed':
        await this.handleTransferReversed(data);
        break;
    }
  }

  /**
   * Get or create recipient with caching
   */
  private async getOrCreateRecipient(bankDetails: BankDetails): Promise<{ success: boolean; recipient_code?: string; error?: string }> {
    try {
      // Create cache key
      const cacheKey = `${bankDetails.account_number}_${bankDetails.bank_code}`;

    const recipient_code = await  cacheService.get<any>(cacheKey)
      
      // Check cache first
      if (recipient_code) {
        return {
          success: true,
          recipient_code
        };
      }

      // Create new recipient
      const recipientRequest: CreateRecipientRequest = {
        type: 'nuban',
        name: bankDetails.account_name,
        account_number: bankDetails.account_number,
        bank_code: bankDetails.bank_code,
        currency: this.defaultCurrency
      };

      const result = await this.paystack.createRecipient(recipientRequest);
      
      // @ts-ignore
      if (!result.status) {
        return {
          success: false,
          error: (result as any)?.message || (result as any)?.error || "Failed to create transfer recipient"
        };
      }

      // Cache the recipient code
      if (result.recipient_code) {
        await  cacheService.set(cacheKey, result.recipient_code)
      }

      return {
        success: true,
        recipient_code: result.recipient_code
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create recipient'
      };
    }
  }

  /**
   * Handle successful transfer webhook
   */
  private async handleTransferSuccess(data: TransferWebhookData): Promise<void> {
    // Implement custom logic for successful transfers
    // e.g., update user wallet balance, send notifications, etc.
    console.log('Transfer completed successfully:', data.transfer_code);
  }

  /**
   * Handle failed transfer webhook
   */
  private async handleTransferFailed(data: TransferWebhookData): Promise<void> {
    // Implement custom logic for failed transfers
    // e.g., refund user wallet, log errors, send notifications, etc.
    console.log('Transfer failed:', data.transfer_code, data.failure_reason);
  }

  /**
   * Handle reversed transfer webhook
   */
  private async handleTransferReversed(data: TransferWebhookData): Promise<void> {
    // Implement custom logic for reversed transfers
    // e.g., update user wallet balance, send notifications, etc.
    console.log('Transfer reversed:', data.transfer_code);
  }

  /**
   * Clear recipient cache
   */
  clearRecipientCache(): void {
    this.recipientCache = {};
  }

  /**
   * Get cached recipient count
   */
  getCachedRecipientCount(): number {
    return Object.keys(this.recipientCache).length;
  }
}

export default WalletTransferService;