import { logger } from "../../logger";
import { deepFlatten } from "../../utils/commonUtils";
import { mailerV2 } from "../../utils/mailer_v2";
import { supabaseClient } from "../../utils/supabase";
import { BaseNotificationChannel } from "./channels";
import { Notification, NotificationResponse } from "./types";


export class EmailNotificationChannel extends BaseNotificationChannel {
  constructor() {
    super(['order', 'payment', 'referral', 'system', 'promotion', 'feedback']);
  }

  async send(notification: Notification): Promise<NotificationResponse> {
    // Implement your email service integration
    try {
      const { data: recipient, error } = await supabaseClient.from("profiles").select("email").eq("id", notification.recipient_id).single()

      if (error) {
        logger.error("Failed to get notification recipient email from database", error, notification)
        return { success: false, channel: 'email', message: "Attempt to get recipient email failed" };
      }

      const meta = deepFlatten(notification)

      console.log({meta});
      

      // Call your existing email service
      await mailerV2.sendTemplateEmail({
        subject: notification.title,
        template: `${meta.type}${meta?.email_notification_template_variant ? `-${meta.email_notification_template_variant}`:''}-notification`,
        to: recipient.email,
        ...meta
      })
      return { success: true, channel: 'email' };
    } catch (error) {
      return { success: false, channel: 'email', message: error.message };
    }
  }
}