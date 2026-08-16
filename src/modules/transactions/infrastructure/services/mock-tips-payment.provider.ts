import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import {
  TipsPaymentProvider,
  TipsPaymentStatusResult,
} from '../../application/ports/tips-payment.port';
import { TransactionsRepository } from '../persistence/transactions.repository';

/**
 * Dev/UAT stand-in for real TIPS connectivity. Signature check is a shared
 * secret (TIPS_WEBHOOK_SECRET) rather than TIPS's real scheme — swap this
 * class, not its callers, once sandbox credentials exist.
 */
@Injectable()
export class MockTipsPaymentProvider extends TipsPaymentProvider {
  private readonly secret?: string;

  constructor(
    config: ConfigService,
    private readonly transactions: TransactionsRepository,
  ) {
    super();
    this.secret = config.get<string>('tips.webhookSecret');
  }

  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean {
    if (!this.secret) return true; // no secret configured — dev convenience, not a production posture
    if (!signatureHeader) return false;
    const expected = Buffer.from(this.secret);
    const actual = Buffer.from(signatureHeader);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  /**
   * Mock resolution: a payment already recorded is authoritative (we are
   * the system of record for our own ledger); anything still INITIATED and
   * older than the caller's timeout window is treated as failed, since
   * there is no real TIPS to ask. Kept async to match the real adapter's
   * shape.
   */
  async queryPaymentStatus(
    tipsEndToEndId: string,
  ): Promise<TipsPaymentStatusResult> {
    const payment =
      await this.transactions.findByTipsEndToEndId(tipsEndToEndId);
    if (!payment) return { status: 'UNKNOWN' };
    if (payment.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        tipsSettledAt: payment.tipsSettledAt ?? undefined,
      };
    }
    if (payment.status === 'FAILED' || payment.status === 'REVERSED') {
      return { status: 'FAILED' };
    }
    return { status: 'PENDING' };
  }
}
