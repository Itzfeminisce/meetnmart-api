interface CallParticipant {
    id: string;
    name: string;
}

interface CallData<TData = any, TReceiver = CallParticipant> {
    room: string;
    caller: CallParticipant;
    receiver: TReceiver;
    data?: TData
}

type EscrowData = CallData<{
    amount: number,
    itemTitle: string;
    itemDescription: string;
    reference?: string;
    call_session_id: string;
    [key: string]: any;
}>

interface EscrowTransactionDetails {
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


type EscrowReleasedData = CallData<EscrowTransactionDetails>


  

export type EscrowStatus = "initiated" | "pending" | "held" | "delivered" | "confirmed" | "released" | "disputed" | "refunded" | "rejected"
