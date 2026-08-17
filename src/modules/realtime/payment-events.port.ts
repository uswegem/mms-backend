export interface PaymentConfirmedEvent {
  paymentId: string;
  tipsEndToEndId: string;
  amount: string;
  currency: string;
  channel: string;
  storeId?: string | null;
  terminalId?: string | null;
  payerFsp?: string | null;
  receivedAt: string; // ISO
}

/**
 * The §4.5 "real-time confirmation via webhook/socket to merchant portal"
 * requirement — a merchant's till screen learns a payment landed without
 * polling. TransactionsService depends on this port, not the WebSocket
 * gateway directly, so it stays testable without a socket server and the
 * transport is swappable (e.g. fanning out over Redis pub/sub later if
 * this ever runs as more than one instance).
 */
export abstract class PaymentEventsPublisher {
  abstract publishPaymentConfirmed(
    merchantId: string,
    event: PaymentConfirmedEvent,
  ): void;
}
