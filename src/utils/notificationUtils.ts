import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { FCMService, getFCMService } from "./fcmUtils";
import { supabaseClient } from "./supabase";
import { logger } from "../logger";
import { BatchNotificationResult, FCMNotification, FCMNotificationResult, NotificationData, NotificationType } from "../globals";

type Database = any;

  export class NotificationService {
    private fcmService: FCMService;
    private supabase: SupabaseClient<Database>;
    
    constructor() {
      this.fcmService = getFCMService();
      this.supabase = supabaseClient
    }
  
    /**
     * Send notification to a single user by userId
     */
    public async notifyUser(
      userId: string,
      data: NotificationData,
      priority: FCMNotification['priority'] = 'high',
      ttl: FCMNotification['ttl'] = 86400
    ): Promise<FCMNotificationResult | null> {
      try {
        // Get user's FCM token
        const { data: tokens, error } = await this.supabase
          .from('fcm_tokens')
          .select('token')
          .eq('user_id', userId)
          .eq('is_valid', true)
          .order('created_at', { ascending: false })
          .single();
  
        if (error || !tokens.token) {
          logger.warn(`No valid FCM token found for user ${userId}`);
          return null;
        }
  
        // Send to user's latest token
        const token = tokens.token;
        return await this.fcmService.sendPushNotification({
          token,
          data,
          priority,
          ttl
        });
      } catch (error) {
        logger.error('Error in notifyUser:', error);
        return null;
      }
    }
  
    /**
     * Send notification to multiple users by userIds
     */
    public async notifyUsers(
      userIds: string[],
      data: NotificationData,
      priority: FCMNotification['priority'] = 'high',
      ttl: FCMNotification['ttl'] = 86400
    ): Promise<BatchNotificationResult> {
      try {
        // Get FCM tokens for all users
        const { data: tokens, error } = await this.supabase
          .from('fcm_tokens')
          .select('token')
          .in('user_id', userIds)
          .eq('is_valid', true);
  
        if (error || !tokens || tokens.length === 0) {
          logger.warn(`No valid FCM tokens found for the specified users`);
          return {
            successes: [],
            failures: [],
            totalSent: 0,
            totalFailed: 0
          };
        }
  
        // Extract token strings
        const tokenStrings = tokens.map(t => t.token);
        
        // Send multicast notification
        return await this.fcmService.sendMulticastNotification(
          tokenStrings,
          data,
          priority,
          ttl
        );
      } catch (error) {
        logger.error('Error in notifyUsers:', error);
        return {
          successes: [],
          failures: [],
          totalSent: 0,
          totalFailed: 0
        };
      }
    }
  
    /**
     * Queue notification for delivery to a user
     */
    public async queueNotificationForUser(
      userId: string,
      data: NotificationData,
      priority: FCMNotification['priority'] = 'high',
      ttl: FCMNotification['ttl'] = 86400,
      maxAttempts = 3
    ): Promise<string | null> {
      try {
        // Get user's FCM token
        const { data: tokens, error } = await this.supabase
          .from('fcm_tokens')
          .select('token')
          .eq('user_id', userId)
          .eq('is_valid', true)
          .order('created_at', { ascending: false })
          .limit(1);
  
        if (error || !tokens || tokens.length === 0) {
          logger.warn(`No valid FCM token found for user ${userId}`);
          return null;
        }
  
        // Queue notification
        return await this.fcmService.queueNotification({
          userId,
          token: tokens[0].token,
          data,
          priority,
          ttl,
          maxAttempts
        });
      } catch (error) {
        logger.error('Error queueing notification for user:', error);
        return null;
      }
    }
  
    /**
     * Create notification payload for different types
     */
    public createNotificationData(type: NotificationType, params: Record<string, any>): NotificationData {
      switch (type) {
        case 'call':
          return {
            type,
            title: params.title || 'Incoming Call',
            body: params.body || 'Someone is calling you',
            callId: params.callId,
            icon: params.icon || '/call-icon.png',
            redirectUrl: params.redirectUrl || `/call/${params.callId}`
          };
          
        case 'accept-call':
          return {
            type,
            title: params.title || 'Call Accepted',
            body: params.body || 'Your call was accepted',
            callId: params.callId,
            redirectUrl: params.redirectUrl || `/call/${params.callId}`
          };
          
        case 'reject-call':
          return {
            type,
            title: params.title || 'Call Rejected',
            body: params.body || 'Your call was rejected',
            callId: params.callId
          };
          
        case 'escrow-released':
          return {
            type,
            title: params.title || 'Escrow Released',
            body: params.body || 'Funds have been released from escrow',
            transactionId: params.transactionId,
            amount: params.amount,
            redirectUrl: params.redirectUrl || `/transaction/${params.transactionId}`
          };
          
        case 'escrow-rejected':
          return {
            type,
            title: params.title || 'Escrow Rejected',
            body: params.body || 'Escrow transaction was rejected',
            transactionId: params.transactionId,
            redirectUrl: params.redirectUrl || `/transaction/${params.transactionId}`
          };
          
        case 'dispute-raised':
          return {
            type,
            title: params.title || 'Dispute Raised',
            body: params.body || 'A dispute has been raised on your transaction',
            disputeId: params.disputeId,
            transactionId: params.transactionId,
            redirectUrl: params.redirectUrl || `/disputes/${params.disputeId}`
          };
          
        case 'wallet-credited':
          return {
            type,
            title: params.title || 'Wallet Credited',
            body: params.body || `Your wallet has been credited with ${params.amount}`,
            amount: params.amount,
            currency: params.currency || 'USD',
            redirectUrl: params.redirectUrl || '/wallet'
          };
          
        case 'general':
        default:
          return {
            type: 'general',
            title: params.title || 'Notification',
            body: params.body || 'You have a new notification',
            icon: params.icon,
            redirectUrl: params.redirectUrl,
            ...params
          };
      }
    }
  }
  
  export const getNotificationService = (): NotificationService => {
    return new NotificationService();
  };