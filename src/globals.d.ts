import { SupabaseClient } from "@supabase/supabase-js";
import { MCPSSEClient } from "./llm/MCPSSEClient";


export type UserType = "buyer" | "seller" | "moderator" | "admin" | "delivery_agent"
export interface CallParticipant {
  id: string;
  name: string;
}

interface Location {
  address: string;
  components?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

interface UserProfile {
  id: string;
  phone_number: string;
  name: string;
  avatar: string;
  created_at: string;
  updated_at: string;
  category: string | null;
  description: string;
  is_online: boolean;
  is_reachable: boolean;
  lng: number;
  lat: number;
  is_verified: boolean;
  is_premium: boolean;
  location: Location;
  role: UserType
}

interface AppMetadata {
  provider: string;
  providers: string[];
}

interface UserMetadata {
  email_verified: boolean;
  phone_verified: boolean;
  sub: string;
}

interface AuthenticatedUser extends Omit<UserProfile, "phone_number"> {
  id: string;
  email: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      client?: SupabaseClient<any, "public", any>
      mcpClient?:  MCPSSEClient
    }
  }
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

export interface GetNearbySellerResponse {
  seller_id: string
  name: string
  email: string
  avatar: string
  distance_km: number
  seller_status: {
    is_online: boolean
    is_premium: boolean
    description: string
    is_verified: boolean
    is_reachable: boolean
  }
  products: {
    items: Product[]
    has_more: boolean
    total_count: number
  }
  reviews_summary: {
    total_reviews: number
    average_rating: number
    recent_reviews: Review[]
  }
  avg_response_time_minutes: number
}

export interface Product {
  id: string
  name: string
  image: string
  price: number
  category: string
  in_stock: boolean
  created_at: string
  description: string
}

export interface Review {
  rating: number
  created_at: string
  feedback_text: string
}
