import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GatewayNotification,
  PaymentGatewayInterface,
} from '../../application/ports/payment-gateway.port';
import { ReferenceResolutionService } from '../../application/services/reference-resolution.service';
import {
  ReferenceErrorCode,
  ReferenceResolutionException,
} from '../../domain/reference-resolution.exception';

/**
 * Mock gateway for M4 — validates/looks up via ReferenceResolutionService
 * (same contract M3 TIPS adapter must use).
 */
@Injectable()
export class MockPaymentGateway implements PaymentGatewayInterface {
  private readonly transactions = new Map<string, GatewayNotification>();

  constructor(private readonly resolution: ReferenceResolutionService) {}

  async validateReference(reference: string) {
    try {
      const resolved = await this.resolution.resolve(reference, {
        channel: 'MOCK',
      });
      return this.resolution.toPayerFacing(resolved);
    } catch (err) {
      if (err instanceof ReferenceResolutionException) {
        if (err.code === ReferenceErrorCode.NOT_FOUND) {
          throw new NotFoundException({ code: err.code, message: err.message });
        }
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  async initiatePayment(input: {
    paymentReference: string;
    amount: string;
    outcome?: 'success' | 'failure' | 'pending';
  }) {
    await this.validateReference(input.paymentReference);
    const notification: GatewayNotification = {
      paymentReference: this.resolution.normalize(input.paymentReference),
      amount: input.amount,
      outcome: input.outcome ?? 'pending',
      gatewayTxnRef: `MOCK-${crypto.randomUUID()}`,
      channel: 'MOCK',
      gatewayPaidAt: input.outcome === 'success' ? new Date().toISOString() : undefined,
    };
    this.transactions.set(notification.gatewayTxnRef, notification);
    return notification;
  }

  async getPaymentStatus(gatewayTxnRef: string) {
    return this.transactions.get(gatewayTxnRef);
  }

  async handlePaymentNotification(payload: GatewayNotification) {
    this.transactions.set(payload.gatewayTxnRef, {
      ...payload,
      paymentReference: this.resolution.normalize(payload.paymentReference),
      gatewayPaidAt:
        payload.outcome === 'success'
          ? (payload.gatewayPaidAt ?? new Date().toISOString())
          : payload.gatewayPaidAt,
    });
    return this.transactions.get(payload.gatewayTxnRef)!;
  }
}
