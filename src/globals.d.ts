export interface CallParticipant {
    id: string;
    name: string;
}

export interface CallData<TData = any, TReceiver = CallParticipant> {
    room: string;
    caller: CallParticipant;
    receiver: TReceiver;
    data?: TData
}

export type EscrowData = CallData<{
    amount: number,
    itemTitle: string;
    itemDescription: string;
    reference?: string;
    call_session_id: string;
    [key: string]: any;
}>

export interface EscrowTransactionDetails {
    amount: number;
    itemDescription: string;
    itemTitle: string;
    feedback: string;
    call_session_id: string;
    duration: string; // format: HH:MM:SS.sss
    started_at: string; // ISO 8601 date-time
    ended_at: string; // ISO 8601 date-time
    seller_id: string;
    seller_name: string;
    seller_avatar: string;
    buyer_id: string;
    buyer_name: string;
    buyer_avatar: string;
    agent_id: string | null;
    agent_name: string | null;
    agent_avatar: string | null;
    transaction_id: string;
    status: EscrowStatus
    reference: string;
    transaction_created_at: string; // ISO 8601 date-time
  }


export type EscrowReleasedData = CallData<EscrowTransactionDetails>


  

type EscrowStatus = "initiated" | "pending" | "held" | "delivered" | "confirmed" | "released" | "disputed" | "refunded" | "rejected"


export type NotificationType = 
  | 'general' 
  | 'call' 
  | 'accept-call' 
  | 'reject-call'
  | 'escrow-released'
  | 'escrow-rejected'
  | 'dispute-raised'
  | 'wallet-credited';

export interface NotificationData {
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  redirectUrl?: string;
  /**
   * This is the room name or roomId
   */
  callId?: string;
  [key: string]: any; // For additional custom data
}

export interface FCMNotification {
  token: string;
  data: NotificationData;
  priority?: 'normal' | 'high';
  ttl?: number; // Time to live in seconds
}

export interface FCMNotificationResult {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
  token: string;
  timestamp: Date;
}

export interface BatchNotificationResult {
  successes: FCMNotificationResult[];
  failures: FCMNotificationResult[];
  totalSent: number;
  totalFailed: number;
}

export interface QueuedNotification extends FCMNotification {
  id?: string;
  userId: string;
  status: 'pending' | 'sent' | 'failed';
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  errorMessage?: string;
}