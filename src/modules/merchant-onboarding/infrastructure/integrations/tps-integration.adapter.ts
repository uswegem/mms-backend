import { Injectable } from '@nestjs/common';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

export interface TpsRegistrationRequest {
  merchantId: string;
  legalName: string;
  tradingName: string;
  mcc: string;
  taxId?: string | null;
}

export interface TpsRegistrationResult {
  success: boolean;
  tpsMerchantId?: string;
  referenceId?: string;
  failureReason?: string;
  responsePayload: Record<string, unknown>;
}

@Injectable()
export class TpsIntegrationAdapter {
  constructor(private readonly prisma: PrismaService) {}

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
        responsePayload: (existing.responsePayload as Record<string, unknown>) ?? {},
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

    const simulateFail =
      request.tradingName.toUpperCase().includes('TPS_FAIL') ||
      request.legalName.toUpperCase().includes('TPS_FAIL');

    const tpsMerchantId = simulateFail
      ? undefined
      : `TPS-${request.merchantId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const result: TpsRegistrationResult = simulateFail
      ? {
          success: false,
          failureReason: 'TPS directory registration rejected (simulated)',
          responsePayload: { code: 'TPS_REJECTED', simulated: true },
        }
      : {
          success: true,
          tpsMerchantId,
          referenceId: tpsMerchantId,
          responsePayload: {
            code: 'TPS_REGISTERED',
            tpsMerchantId,
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
        externalReferenceId: tpsMerchantId,
        requestPayload,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
        status: result.success ? IntegrationStatus.SUCCESS : IntegrationStatus.FAILED,
        failureReason: result.failureReason,
        retryCount: 0,
        lastTriedAt: new Date(),
      },
      update: {
        externalReferenceId: tpsMerchantId,
        requestPayload,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
        status: result.success ? IntegrationStatus.SUCCESS : IntegrationStatus.FAILED,
        failureReason: result.failureReason,
        retryCount: { increment: 1 },
        lastTriedAt: new Date(),
      },
    });

    return result;
  }
}
