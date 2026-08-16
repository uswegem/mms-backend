export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface GatewayNotification {
  paymentReference: string;
  gatewayTxnRef: string;
  amount: string;
  outcome: 'success' | 'failure' | 'pending';
  channel?: 'MOCK' | 'QR' | 'LIPA_NAMBA' | 'USSD' | 'API' | 'BANK_BRANCH' | 'MOBILE_MONEY' | 'OTHER';
  payerNameMasked?: string;
  payerMsisdnMasked?: string;
  /** Gateway completion timestamp; MMS records its own receipt timestamp. */
  gatewayPaidAt?: string;
  rawPayload?: Record<string, unknown>;
}

export interface PaymentGatewayInterface {
  validateReference(reference: string): Promise<unknown>;
  initiatePayment(input: {
    paymentReference: string;
    amount: string;
    outcome?: 'success' | 'failure' | 'pending';
  }): Promise<GatewayNotification>;
  getPaymentStatus(gatewayTxnRef: string): Promise<GatewayNotification | undefined>;
  handlePaymentNotification(payload: GatewayNotification): Promise<GatewayNotification>;
}
