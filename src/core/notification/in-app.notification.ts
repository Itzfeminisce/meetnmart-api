import { cacheService } from "../../utils/cacheUtils";
import { getSocketIO } from "../../utils/socketio";
import { BaseNotificationChannel } from "./channels";
import { Notification, NotificationResponse } from "./types";


export class InAppNotificationChannel extends BaseNotificationChannel {
    private notifications: Notification[] = [];
  
    constructor() {
      super(['feedback', 'order', 'payment', 'referral', 'achievement', 'system']);
    }
  
    async send(notification: Notification): Promise<NotificationResponse> {
      try {
        // Store notification in memory (in a real app, you'd use a database)
        this.notifications.push(notification);
        return { success: true, channel: 'in-app' };
      } catch (error) {
        return { success: false, channel: 'in-app', message: error.message };
      }
    }
  
    getUnreadNotifications(recipientId: string): Notification[] {
      return this.notifications.filter(
        n => n.recipient_id === recipientId && !n.is_read
      );
    }
  
    markAsRead(notificationId: string): void {
      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.is_read = true;
      }
    }
  }