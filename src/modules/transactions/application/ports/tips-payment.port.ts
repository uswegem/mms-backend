export type TipsQueriedStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN';

export interface TipsPaymentStatusResult {
  status: TipsQueriedStatus;
  tipsSettledAt?: Date;
}

/**
 * TIPS is the caller for payment confirmation (a payer's FSP settles via
 * TIPS, which then calls our webhook) — so "adapter" here covers the two
 * things we genuinely call TIPS *for*: verifying an inbound webhook really
 * came from TIPS, and polling status on a payment stuck in INITIATED
 * (brief §4.5's "failed/timeout reconciliation ... with retry"). Swappable
 * for the real TIPS integration once BOT/TIPS sandbox access exists.
 */
export abstract class TipsPaymentProvider {
  abstract verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean;
  abstract queryPaymentStatus(
    tipsEndToEndId: string,
  ): Promise<TipsPaymentStatusResult>;
}
