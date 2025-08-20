export enum CallAction {
  Incoming = "CALL_INCOMING",
  Outgoing = "CALL_OUTGOING",
  Accepted = "CALL_ACCEPTED",
  Rejected = "CALL_REJECTED",
  Ended = "CALL_ENDED",
  TimedOut = "CALL_TIMED_OUT",
  EscrowRequested = "ESCROW_REQUESTED",
  EscrowAccepted = "ESCROW_ACCEPTED",
  EscrowRejected = "ESCROW_REJECTED",
  EscrowReleased = "ESCROW_RELEASED",

  NotificationNewBookmark = "NEW_BOOKMARK_EVENT",
  CalculateWithdrawalReceivedAmount = "CALCULATE_WITHDRAWAL_RECIEVED_AMOUNT_EVENT",

  CreateChat = "CREATE_CHAT_EVENT",
  ChatTyping= "CREATE_CHAT_EVENT.TYPING",
  ChatRead = "CREATE_CHAT_EVENT.READ",
  IncomingChat = "CHAT_READ_EVENT.EVENT_INCOMING",
}

export enum AppEvent {
  DISCONNECT = "logout"
}