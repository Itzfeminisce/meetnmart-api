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
}

export enum AppEvent {
  DISCONNECT = "logout"
}