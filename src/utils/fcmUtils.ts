import { cert, initializeApp, getApps, App } from 'firebase-admin/app';
import { getMessaging, Message, Messaging } from 'firebase-admin/messaging';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';
import { supabaseClient } from './supabase';
import path from "path"

const firebaseServiceAccountCreds = path.join(process.cwd(), "meetnmart-firebase-adminsdk-fbsvc-02a5140265.json")

type Database = any


export class FCMService {
  private messaging: Messaging;
  private app: App;
  private supabase: SupabaseClient<Database>;
  private static instance: FCMService;

  private constructor() {
    // Initialize Firebase Admin if not already initialized
    if (!getApps().length) {
      this.app = initializeApp({
        credential: cert(firebaseServiceAccountCreds),
      });
    } else {
      this.app = getApps()[0];
    }

    this.messaging = getMessaging(this.app);

    // Initialize Supabase client
    this.supabase = supabaseClient
  }

  public static getInstance(): FCMService {
    if (!FCMService.instance) {
      FCMService.instance = new FCMService();
    }
    return FCMService.instance;
  }

  /**
   * Send a notification to a single FCM token
   */
  public async sendPushNotification(
    notification: FCMNotification
  ): Promise<FCMNotificationResult> {
    try {
      // Construct FCM message based on notification type
      const message = this.buildFCMMessage(notification);

      // Send message
      const response = await this.messaging.send(message);

      const result: FCMNotificationResult = {
        success: true,
        messageId: response,
        token: notification.token,
        timestamp: new Date()
      };

      // Log success
      await this.logNotification({
        ...notification,
        userId: '', // Should be populated by caller
        status: 'sent',
        attemptCount: 1,
        maxAttempts: 1,
        createdAt: new Date(),
        processedAt: new Date()
      });

      return result;
    } catch (error) {
      logger.error('FCM send error:', error);

      const fcmError = error as { code: string; message: string };
      const result: FCMNotificationResult = {
        success: false,
        token: notification.token,
        error: {
          code: fcmError.code || 'unknown-error',
          message: fcmError.message || 'Unknown error occurred'
        },
        timestamp: new Date()
      };

      // Handle common FCM errors
      if (this.isInvalidTokenError(fcmError)) {
        await this.handleInvalidToken(notification.token);
      }

      return result;
    }
  }

  /**
   * Send notifications to multiple FCM tokens
   */
  public async sendMulticastNotification(
    tokens: string[],
    data: FCMNotification['data'],
    priority: FCMNotification['priority'] = 'high',
    ttl: FCMNotification['ttl'] = 86400
  ): Promise<BatchNotificationResult> {
    const results: FCMNotificationResult[] = [];

    // Process in batches of 500 (FCM limit)
    const batchSize = 500;
    const batches = this.chunkArray(tokens, batchSize);

    for (const batch of batches) {
      const promises = batch.map(token =>
        this.sendPushNotification({
          token,
          data,
          priority,
          ttl
        })
      );

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return {
      successes: results.filter(r => r.success),
      failures: results.filter(r => !r.success),
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    };
  }

  /**
   * Queue a notification for delivery or retry
   */
  public async queueNotification(
    notification: Omit<QueuedNotification, 'id' | 'status' | 'attemptCount' | 'createdAt'>
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('fcm_notification_queue')
        .insert({
          user_id: notification.userId,
          token: notification.token,
          data: notification.data,
          priority: notification.priority || 'high',
          ttl: notification.ttl || 86400,
          status: 'pending',
          attempt_count: 0,
          max_attempts: notification.maxAttempts,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Error queuing notification:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      logger.error('Error queuing notification:', error);
      return null;
    }
  }

  /**
   * Process pending notifications in the queue
   */
  public async processNotificationQueue(batchSize = 100): Promise<number> {
    try {
      // Get pending notifications that haven't exceeded max attempts
      const { data: notifications, error } = await this.supabase
        .from('fcm_notification_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('attempt_count', 'max_attempts')
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (error || !notifications) {
        logger.error('Error fetching queued notifications:', error);
        return 0;
      }

      if (notifications.length === 0) {
        return 0;
      }

      // Process each notification
      const results = await Promise.all(
        notifications.map(async (qn) => {
          // Transform from DB format to service format
          const notification: FCMNotification = {
            token: qn.token,
            data: qn.data as any,
            priority: qn.priority as 'normal' | 'high',
            ttl: qn.ttl
          };

          // Update attempt count
          await this.supabase
            .from('fcm_notification_queue')
            .update({
              attempt_count: qn.attempt_count + 1,
              processed_at: new Date().toISOString()
            })
            .eq('id', qn.id);

          // Send notification
          const result = await this.sendPushNotification(notification);

          // Update status based on result
          await this.supabase
            .from('fcm_notification_queue')
            .update({
              status: result.success ? 'sent' : 'failed',
              error_message: result.error?.message
            })
            .eq('id', qn.id);

          return result;
        })
      );

      return results.filter(r => r.success).length;
    } catch (error) {
      logger.error('Error processing notification queue:', error);
      return 0;
    }
  }

  /**
   * Log notification attempt to Supabase
   */
  private async logNotification(
    notification: QueuedNotification
  ): Promise<void> {
    try {
     const {error} =  await this.supabase
        .from('fcm_notification_logs')
        .insert({
          user_id: notification.userId,
          token: notification.token,
          notification_type: notification.data.type,
          title: notification.data.title,
          body: notification.data.body,
          data: notification.data,
          status: notification.status,
          attempt_count: notification.attemptCount,
          error_message: notification.errorMessage,
          created_at: notification.createdAt.toISOString(),
          processed_at: notification.processedAt?.toISOString()
        });

        if(error) throw error
    } catch (error) {
      logger.error('Error logging notification:', error);
    }
  }

  /**
   * Build FCM message based on notification type
   */
  private buildFCMMessage(notification: FCMNotification): Message {
    const { token, data, priority, ttl } = notification;
    const baseMessage: Message = {
      token,
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        ttl: ttl ? ttl * 1000 : undefined, // Convert to milliseconds
      },
      data: {
        ...data,
        // Convert any non-string values to strings
        ...Object.entries(data).reduce((acc, [key, value]) => {
          acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
          return acc;
        }, {} as Record<string, string>),
      }
    };

    // For call notifications, add action buttons
    if (data.type === 'call') {
      return {
        ...baseMessage,
        android: {
          ...baseMessage.android,
          notification: {
            title: data.title,
            body: data.body,
            icon: data.icon || 'ic_notification',
            clickAction: 'OPEN_CALL_ACTIVITY',
          }
        },
        webpush: {
          notification: {
            title: data.title,
            body: data.body,
            icon: data.icon,
            actions: [
              {
                action: 'accept',
                title: 'Accept'
              },
              {
                action: 'reject',
                title: 'Reject'
              }
            ]
          },
          fcmOptions: {
            link: data.redirectUrl
          }
        }
      };
    }

    // For general notifications
    return {
      ...baseMessage,
      android: {
        ...baseMessage.android,
        notification: {
          title: data.title,
          body: data.body,
          icon: data.icon || 'ic_notification',
          clickAction: 'OPEN_MAIN_ACTIVITY',
        }
      },
      webpush: {
        notification: {
          title: data.title,
          body: data.body,
          icon: data.icon
        },
        fcmOptions: {
          link: data.redirectUrl
        }
      }
    };
  }

  /**
   * Check if error is related to invalid token
   */
  private isInvalidTokenError(error: any): boolean {
    const invalidTokenErrors = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered'
    ];
    return invalidTokenErrors.includes(error.code);
  }

  /**
   * Handle invalid token by marking it for removal
   */
  private async handleInvalidToken(token: string): Promise<void> {
    try {
      // Mark token as invalid in database
      const { error } = await this.supabase
        .from('fcm_tokens')
        .update({ is_valid: false, invalidated_at: new Date().toISOString() })
        .eq('token', token);

      if (error) {
        logger.error('Error marking token as invalid:', error);
      }
    } catch (error) {
      logger.error('Error handling invalid token:', error);
    }
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Utility function to get the FCM service instance
export const getFCMService = (): FCMService => {
  return FCMService.getInstance();
};

