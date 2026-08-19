import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeeChargeType,
  FeeSchedule,
  FeeScheduleCharge,
  FeeScheduleScope,
} from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

export type FeeScheduleWithCharges = FeeSchedule & {
  charges: FeeScheduleCharge[];
};

export interface CreateFeeScheduleInput {
  scope: FeeScheduleScope;
  scopeKey?: string;
  charges: Array<{
    chargeType: FeeChargeType;
    basis: FeeScheduleCharge['basis'];
    rate?: number;
    flatAmount?: number;
    capAmount?: number;
  }>;
}

/**
 * Handoff §cfgfees / §ob7: "MDR and transaction fees are configured per
 * merchant category, per segment, or as an individual merchant override in
 * system configuration." Resolution order (most specific wins):
 * MERCHANT override -> MCC schedule -> DEFAULT (global fallback, always
 * exactly one ACTIVE row, seeded at bootstrap).
 *
 * Deliberately NOT a CQRS/DDD-layered module like onboarding — this is a
 * config CRUD + resolver, same shape as TransactionLimitPolicyService.
 */
@Injectable()
export class FeeScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter?: { scope?: FeeScheduleScope; scopeKey?: string }) {
    return this.prisma.feeSchedule.findMany({
      where: {
        scope: filter?.scope,
        scopeKey: filter?.scopeKey,
      },
      include: { charges: true },
      orderBy: [{ scope: 'asc' }, { scopeKey: 'asc' }, { version: 'desc' }],
    });
  }

  async getById(id: string): Promise<FeeScheduleWithCharges> {
    const schedule = await this.prisma.feeSchedule.findUnique({
      where: { id },
      include: { charges: true },
    });
    if (!schedule) throw new NotFoundException(`Fee schedule ${id} not found`);
    return schedule;
  }

  /**
   * Resolves the schedule a merchant is actually billed under right now.
   * Falls back through MCC then DEFAULT; throws only if even DEFAULT is
   * missing, which should never happen once the seed has run once.
   */
  async resolveForMerchant(
    merchantId: string,
  ): Promise<FeeScheduleWithCharges> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { mcc: true },
    });
    if (!merchant)
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    return this.resolve(merchantId, merchant.mcc);
  }

  async resolveForMcc(mcc: string): Promise<FeeScheduleWithCharges> {
    return this.resolve(undefined, mcc);
  }

  private async resolve(
    merchantId: string | undefined,
    mcc: string,
  ): Promise<FeeScheduleWithCharges> {
    const active = (scope: FeeScheduleScope, scopeKey: string | null) =>
      this.prisma.feeSchedule.findFirst({
        where: { scope, scopeKey, status: 'ACTIVE' },
        include: { charges: true },
      });

    if (merchantId) {
      const merchantOverride = await active('MERCHANT', merchantId);
      if (merchantOverride) return merchantOverride;
    }

    const mccSchedule = await active('MCC', mcc);
    if (mccSchedule) return mccSchedule;

    const fallback = await active('DEFAULT', null);
    if (!fallback) {
      throw new NotFoundException(
        'No DEFAULT fee schedule is active — the fee-schedules seed has not run',
      );
    }
    return fallback;
  }

  /** Draft — not usable for billing/disclosure until `activate` runs. */
  async create(
    input: CreateFeeScheduleInput,
    actorId: string,
  ): Promise<FeeScheduleWithCharges> {
    this.validateScopeKey(input.scope, input.scopeKey);
    for (const charge of input.charges) {
      this.validateCharge(charge);
    }

    const version = (await this.prisma.feeSchedule.count()) + 1;
    return this.prisma.feeSchedule.create({
      data: {
        version,
        scope: input.scope,
        scopeKey: input.scope === 'DEFAULT' ? null : input.scopeKey,
        status: 'DRAFT',
        createdBy: actorId,
        charges: { create: input.charges },
      },
      include: { charges: true },
    });
  }

  /**
   * Maker-checker-lite: the actor activating a schedule must not be the
   * one who drafted it. Supersedes whatever was previously ACTIVE for the
   * same scope+scopeKey rather than deleting it — past settlements and
   * onboarding acceptances still reference that row.
   */
  async activate(id: string, actorId: string): Promise<FeeScheduleWithCharges> {
    const schedule = await this.getById(id);
    if (schedule.status !== 'DRAFT') {
      throw new ConflictException(`Fee schedule ${id} is not in DRAFT status`);
    }
    if (schedule.createdBy === actorId) {
      throw new ConflictException(
        'Maker cannot activate their own draft fee schedule',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.feeSchedule.findFirst({
        where: {
          scope: schedule.scope,
          scopeKey: schedule.scopeKey,
          status: 'ACTIVE',
        },
      });
      if (previous) {
        await tx.feeSchedule.update({
          where: { id: previous.id },
          data: { status: 'SUPERSEDED', supersededAt: now },
        });
      }
      return tx.feeSchedule.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          approvedBy: actorId,
          approvedAt: now,
          effectiveFrom: schedule.effectiveFrom ?? now,
        },
        include: { charges: true },
      });
    });
  }

  /** Idempotent — re-accepting the same schedule from a re-entered wizard step just returns the existing row. */
  async recordAcceptance(
    applicationId: string,
    merchantId: string,
    scheduleId: string,
    acceptedBy: string,
  ) {
    return this.prisma.feeScheduleAcceptance.upsert({
      where: { applicationId_scheduleId: { applicationId, scheduleId } },
      update: {},
      create: { applicationId, scheduleId, merchantId, acceptedBy },
    });
  }

  async getAcceptance(applicationId: string, scheduleId: string) {
    return this.prisma.feeScheduleAcceptance.findUnique({
      where: { applicationId_scheduleId: { applicationId, scheduleId } },
    });
  }

  /** MDR rate/cap for the sweep calculation — null if this schedule has no MDR line (shouldn't happen for a real schedule, but sweep must not crash on config drift). */
  mdrCharge(schedule: FeeScheduleWithCharges): FeeScheduleCharge | null {
    return schedule.charges.find((c) => c.chargeType === 'MDR') ?? null;
  }

  private validateScopeKey(scope: FeeScheduleScope, scopeKey?: string) {
    if (scope === 'DEFAULT' && scopeKey) {
      throw new BadRequestException(
        'scopeKey must be omitted for scope=DEFAULT',
      );
    }
    if (scope !== 'DEFAULT' && !scopeKey) {
      throw new BadRequestException(`scopeKey is required for scope=${scope}`);
    }
  }

  private validateCharge(charge: CreateFeeScheduleInput['charges'][number]) {
    if (charge.basis === 'PERCENT_OF_TRANSACTION') {
      if (charge.rate === undefined) {
        throw new BadRequestException(
          `${charge.chargeType}: rate is required for PERCENT_OF_TRANSACTION`,
        );
      }
    } else if (charge.flatAmount === undefined) {
      throw new BadRequestException(
        `${charge.chargeType}: flatAmount is required for ${charge.basis}`,
      );
    }
  }
}
