// utils/email-batcher.ts
interface BatchEmailOptions {
    batchSize?: number;
    delayBetweenBatches?: number; // milliseconds
    maxRetries?: number;
    retryDelay?: number; // milliseconds
  }
  
  interface EmailJob {
    to: string;
    subject: string;
    template: string;
    notificationData: any;
  }
  
  const DEFAULT_OPTIONS: Required<BatchEmailOptions> = {
    batchSize: 10,
    delayBetweenBatches: 1000, // 1 second
    maxRetries: 3,
    retryDelay: 2000 // 2 seconds
  };
  
  export class EmailBatcher {
    private options: Required<BatchEmailOptions>;
  
    constructor(options: BatchEmailOptions = {}) {
      this.options = { ...DEFAULT_OPTIONS, ...options };
    }
  
    async sendBatchedEmails(
      emails: EmailJob[],
      sendFunction: (email: EmailJob) => Promise<void>,
      onProgress?: (completed: number, total: number, failed: number) => void
    ): Promise<{ successful: number; failed: EmailJob[] }> {
      const batches = this.createBatches(emails, this.options.batchSize);
      const failedEmails: EmailJob[] = [];
      let successfulCount = 0;
  
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} emails)`);
  
        const batchResults = await Promise.allSettled(
          batch.map(email => this.sendWithRetry(email, sendFunction))
        );
  
        // Process batch results
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulCount++;
          } else {
            console.error(`Failed to send email to ${batch[index].to}:`, result.reason);
            failedEmails.push(batch[index]);
          }
        });
  
        // Report progress
        if (onProgress) {
          onProgress(successfulCount, emails.length, failedEmails.length);
        }
  
        // Add delay between batches (except for the last batch)
        if (i < batches.length - 1) {
          await this.delay(this.options.delayBetweenBatches);
        }
      }
  
      return {
        successful: successfulCount,
        failed: failedEmails
      };
    }
  
    private async sendWithRetry(
      email: EmailJob,
      sendFunction: (email: EmailJob) => Promise<void>
    ): Promise<void> {
      let lastError: Error | null = null;
  
      for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
        try {
          await sendFunction(email);
          return; // Success
        } catch (error) {
          lastError = error as Error;
          console.warn(`Attempt ${attempt}/${this.options.maxRetries} failed for ${email.to}:`, error);
          
          if (attempt < this.options.maxRetries) {
            await this.delay(this.options.retryDelay * attempt); // Exponential backoff
          }
        }
      }
  
      throw lastError;
    }
  
    private createBatches<T>(items: T[], batchSize: number): T[][] {
      const batches: T[][] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }
      return batches;
    }
  
    private delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }
  
  // Convenience function for common use cases
  export async function sendBatchedTemplateEmails(
    emails: EmailJob[],
    mailer: any, // Your mailerV2 instance
    options: BatchEmailOptions = {}
  ): Promise<{ successful: number; failed: EmailJob[] }> {
    const batcher = new EmailBatcher(options);
    
    return batcher.sendBatchedEmails(
      emails,
      async (email) => {
        await mailer.sendTemplateEmail({
          subject: email.subject,
          template: email.template,
          to: email.to,
          notificationData: email.notificationData
        });
      },
      (completed, total, failed) => {
        console.log(`Email progress: ${completed}/${total} sent, ${failed} failed`);
      }
    );
  }