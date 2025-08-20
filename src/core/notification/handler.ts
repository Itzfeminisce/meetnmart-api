import { error } from "console";
import { logger } from "../../logger";
import { deepFlatten } from "../../utils/commonUtils";
import { InternalServerError } from "../../utils/responses";
import { supabaseClient } from "../../utils/supabase";
import { INotificationChannel } from "./channels";
import { EmailNotificationChannel } from "./email.notification";
import { FirebaseNotificationChannel } from "./firebase.notification";
import { InAppNotificationChannel } from "./in-app.notification";
import { Notification, NotificationChannel, NotificationChannelMap, NotificationResponse, NotificationType } from "./types";

// notification.service.ts
export class NotificationHandler {
  private channels: INotificationChannel[];
  private channelMap: NotificationChannelMap[];

  constructor() {
    this.channels = [
      new EmailNotificationChannel(),
      new FirebaseNotificationChannel(),
      new InAppNotificationChannel()
    ];

    this.channelMap = [
      { type: 'feedback', channels: ["email", 'in-app', 'firebase'] },
      { type: 'order', channels: ['email', 'firebase', 'in-app'] },
      { type: 'payment', channels: ['email', 'firebase', 'in-app'] },
      { type: 'referral', channels: ['email', 'in-app'] },
      { type: 'achievement', channels: ['firebase', 'in-app'] },
      { type: 'system', channels: ['email', 'firebase', 'in-app'] },
      { type: 'promotion', channels: ['email', 'in-app'] },
      { type: 'interaction', channels: ['firebase', 'in-app'] }
    ];
  }

  private getChannelsForType(type: NotificationType): NotificationChannel[] {
    const mapping = this.channelMap.find(m => m.type === type);
    return mapping?.channels || [];
  }

  private async saveToDatabase(notification: Notification): Promise<Notification> {
    if (notification.type === "interaction" && notification.title.includes("view")) return;
    const { type, is_read, priority, sender_id, recipient_id, title, description, ...metadata } = notification
    const { data, error: notificationError } = await supabaseClient.from("notifications").insert({
      type: type,
      is_read: false,
      priority: priority,
      sender_id: sender_id,
      recipient_id: recipient_id,
      description: description,
      timestamp: new Date().toUTCString(),
      title: title,
      metadata: {
        ...(deepFlatten(metadata))
      }
    }).select("*").single()

    if (notificationError) {
      logger.error("Failed to save notification to database", notificationError, notification)
      throw new InternalServerError("Failed to save notification to database")
    }

    return data
  }

  async sendNotification(
    notification: Notification,
    overrideChannels?: NotificationChannel[]
  ): Promise<NotificationResponse[]> {
    const channelsToUse = overrideChannels || this.getChannelsForType(notification.type);
    const results: NotificationResponse[] = [];

    await this.saveToDatabase(notification)

    for (const channel of channelsToUse) {
      const channelInstance = this.channels.find(c => c instanceof this.getChannelClass(channel));
      if (channelInstance && channelInstance.supportsType(notification.type)) {
        const result = await channelInstance.send(notification);
        results.push(result);
      }
    }

    return results;
  }

  private getChannelClass(channel: NotificationChannel): new () => INotificationChannel {
    switch (channel) {
      case 'email': return EmailNotificationChannel;
      case 'firebase': return FirebaseNotificationChannel;
      case 'in-app': return InAppNotificationChannel;
      default: throw new Error(`Unknown channel: ${channel}`);
    }
  }
}