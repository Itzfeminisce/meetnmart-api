import { Notification, NotificationType, NotificationResponse } from "./types";

export interface INotificationChannel {
    send(notification: Notification): Promise<NotificationResponse>;
    supportsType(type: NotificationType): boolean;
  }
  
  export abstract class BaseNotificationChannel implements INotificationChannel {
    constructor(protected supportedTypes: NotificationType[]) {}
    
    abstract send(notification: Notification): Promise<NotificationResponse>;
    
    supportsType(type: NotificationType): boolean {
      return this.supportedTypes.includes(type);
    }
  }