import { Injectable } from '@nestjs/common';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import {
  TpsRegistrationProvider,
  TpsRegistrationRequest,
  TpsRegistrationResult,
} from '../../application/ports/tps-registration.port';

/**
 * Dev/UAT stand-in for real TIPS directory registration. Swap this class,
 * not its callers, once BOT/TIPS sandbox access exists.
 */
@Injectable()
export class MockTpsRegistrationProvider extends TpsRegistrationProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async registerMerchant(
    request: TpsRegistrationRequest,
    idempotencyKey: string,
    actorId: string,
  ): Promise<TpsRegistrationResult> {
    const existing = await this.prisma.merchantIntegration.findFirst({
      where: {
        merchantId: request.merchantId,
        integrationType: IntegrationType.TPS,
        idempotencyKey,
        status: IntegrationStatus.SUCCESS,
      },
    });

    if (existing?.externalReferenceId) {
      return {
        success: true,
        tpsMerchantId: existing.externalReferenceId,
        referenceId: existing.externalReferenceId,
        responsePayload:
          (existing.responsePayload as Record<string, unknown>) ?? {},
      };
    }

    const requestPayload = {
      merchantId: request.merchantId,
      legalName: request.legalName,
      tradingName: request.tradingName,
      mcc: request.mcc,
      taxId: request.taxId,
      requestedBy: actorId,
      requestedAt: new Date().toISOString(),
    };

    const simulateFail = request.simulateOutcome === 'FAIL';

    const tipsMerchantId = simulateFail
      ? undefined
      : `TIPS-${request.merchantId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const result: TpsRegistrationResult = simulateFail
      ? {
          success: false,
          failureReason: 'TIPS directory registration rejected (simulated)',
          responsePayload: { code: 'TIPS_REJECTED', simulated: true },
        }
      : {
          success: true,
          tpsMerchantId: tipsMerchantId,
          referenceId: tipsMerchantId,
          responsePayload: {
            code: 'TIPS_REGISTERED',
            tipsMerchantId,
            simulated: true,
          },
        };

    await this.prisma.merchantIntegration.upsert({
      where: {
        merchantId_integrationType_idempotencyKey: {
          merchantId: request.merchantId,
          integrationType: IntegrationType.TPS,
          idempotencyKey,
        },
      },
      create: {
        merchantId: request.merchantId,
        integrationType: IntegrationType.TPS,
        idempotencyKey,
        externalReferenceId: tipsMerchantId,
        requestPayload,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
        status: result.success
          ? IntegrationStatus.SUCCESS
          : IntegrationStatus.FAILED,
        failureReason: result.failureReason,
        retryCount: 0,
        lastTriedAt: new Date(),
      },
      update: {
        externalReferenceId: tipsMerchantId,
        requestPayload,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
        status: result.success
          ? IntegrationStatus.SUCCESS
          : IntegrationStatus.FAILED,
        failureReason: result.failureReason,
        retryCount: { increment: 1 },
        lastTriedAt: new Date(),
      },
    });

    return result;
  }
}
