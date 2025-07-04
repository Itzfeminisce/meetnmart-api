// notification.types.ts
export type NotificationType = 'feedback' | 'order' | 'payment' | 'referral' | 'achievement' | 'system' | 'promotion' | 'interaction';
export type NotificationPriority = 'low' | 'medium' | 'high';
export type NotificationChannel = 'email' | 'firebase' | 'in-app';

export interface Notification {
  id?: string;
  recipient_id: string;
  sender_id: string;
  type: NotificationType;
  email_notification_template_variant?: string;
  title: string;
  description?: string;
  is_read?: boolean;
  priority?: NotificationPriority;
  timestamp?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface NotificationChannelMap {
  type: NotificationType;
  channels: NotificationChannel[];
}

export interface NotificationResponse {
  success: boolean;
  channel: NotificationChannel;
  message?: string;
}