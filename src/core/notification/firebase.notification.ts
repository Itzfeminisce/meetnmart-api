import { cacheService } from "../../utils/cacheUtils";
import { getFCMService } from "../../utils/fcmUtils";
import { supabaseClient } from "../../utils/supabase";
import { BaseNotificationChannel } from "./channels";
import { Notification, NotificationResponse } from "./types";

// firebase.notification.ts
export class FirebaseNotificationChannel extends BaseNotificationChannel {
  constructor() {
    super(['feedback', 'order', 'payment', 'achievement', 'system']);
  }

  async send(notification: Notification): Promise<NotificationResponse> {
    const { data: users, error } = await supabaseClient.from("fcm_tokens").select("token").eq("user_id", notification.recipient_id)

    if (error) return { success: false, channel: 'firebase', message: "Failed to fetch user fcmTokens" };

    const firebaseClient = getFCMService()
    const fcmTokens = users.map(it => it.token)


    try {
      const responses = await firebaseClient.sendMulticastNotification(
        fcmTokens,
        {
          body: notification.description,
          title: notification.title,
          type: "general",
          callId: notification.recipient_id,
          icon: "",
          redirectUrl: "/"
        },
        "normal")
      // Call your existing Firebase service
      return { success: true, channel: 'firebase', message: JSON.stringify(responses) };
    } catch (error) {
      return { success: false, channel: 'firebase', message: error.message };
    }
  }
}