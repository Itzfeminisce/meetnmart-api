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
    [key: string]: any;
}>

type EscrowStatus = "pending" | "rejected" | "initiated" | "held" | "delivered" | "confirmed" | "released" | "disputed" | "refunded"
