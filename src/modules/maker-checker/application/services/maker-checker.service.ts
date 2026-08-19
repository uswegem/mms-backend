import { Injectable } from '@nestjs/common';
import { ApprovalEntityType, ApprovalTaskStatus } from '@prisma/client';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ApprovalsRepository } from '../../infrastructure/persistence/approvals.repository';
import {
  ApprovalTaskNotFoundException,
  ApprovalValidationException,
  MakerCheckerViolationException,
} from '../../domain/exceptions/approval.exceptions';

/**
 * Handoff §cfgmc: only these entity types have a real maker-checker gate
 * wired into a workflow (onboarding-pipeline.service.ts,
 * onboarding-workflow.service.ts, merchant-status-lifecycle.service.ts,
 * disputes.service.ts's initiateRefund — each calls isEnabled()/
 * createTask() with one of exactly these four). The other
 * ApprovalEntityType enum values (SETTLEMENT_BATCH, FEE_RULE,
 * MERCHANT_LIMIT, CONFIG_CHANGE) exist in the schema for future use but
 * nothing creates a task for them yet — toggling a policy for one of
 * those today would have zero effect, so cfgmc deliberately doesn't
 * surface them as configurable.
 */
const CONFIGURABLE_ENTITY_TYPES: ApprovalEntityType[] = [
  ApprovalEntityType.MERCHANT_ONBOARDING,
  ApprovalEntityType.SCHOOL_ONBOARDING,
  ApprovalEntityType.MERCHANT_STATUS_CHANGE,
  ApprovalEntityType.DISPUTE_REFUND,
];

@Injectable()
export class MakerCheckerService {
  constructor(
    private readonly approvals: ApprovalsRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** Every configurable activity, defaulting to {enabled: true, slaHours: 24} where no row has been saved yet. */
  async listPolicies(acquirerId: string) {
    const rows = await this.approvals.listPolicies(
      acquirerId,
      CONFIGURABLE_ENTITY_TYPES,
    );
    const byType = new Map(rows.map((r) => [r.entityType, r]));
    return CONFIGURABLE_ENTITY_TYPES.map((entityType) => {
      const row = byType.get(entityType);
      return {
        entityType,
        enabled: row?.enabled ?? true,
        slaHours: row?.slaHours ?? 24,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async updatePolicy(
    acquirerId: string,
    entityType: ApprovalEntityType,
    enabled: boolean,
    slaHours: number,
    actorId: string,
  ) {
    if (!CONFIGURABLE_ENTITY_TYPES.includes(entityType)) {
      throw new ApprovalValidationException(
        `${entityType} has no maker-checker workflow wired up yet — changing this policy would have no effect`,
      );
    }
    const before = await this.approvals.findPolicy(acquirerId, entityType);
    const policy = await this.approvals.upsertPolicy(
      acquirerId,
      entityType,
      enabled,
      slaHours,
    );
    await this.audit.record({
      actorId,
      action: 'APPROVAL_POLICY_UPDATED',
      entityType: 'approval_policy',
      // entityId is a real UUID column — use the policy row's own id, not
      // a composite acquirerId:entityType string (that's in metadata below).
      entityId: policy.id,
      metadata: {
        acquirerId,
        entityType,
        before: {
          enabled: before?.enabled ?? true,
          slaHours: before?.slaHours ?? 24,
        },
        after: { enabled: policy.enabled, slaHours: policy.slaHours },
      },
    });
    return {
      entityType: policy.entityType,
      enabled: policy.enabled,
      slaHours: policy.slaHours,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async isEnabled(
    acquirerId: string,
    entityType: ApprovalEntityType,
  ): Promise<boolean> {
    const policy = await this.approvals.findPolicy(acquirerId, entityType);
    return policy?.enabled ?? true;
  }

  async createTask(
    acquirerId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    makerId: string,
  ) {
    const policy = await this.approvals.findPolicy(acquirerId, entityType);
    const slaHours = policy?.slaHours ?? 24;

    const existing = await this.approvals.findPendingByEntity(
      entityType,
      entityId,
    );
    if (existing) {
      throw new ApprovalValidationException(
        'A pending approval task already exists for this entity',
      );
    }

    return this.approvals.createTask({
      acquirerId,
      entityType,
      entityId,
      makerId,
      slaHours,
    });
  }

  async approveTask(taskId: string, checkerId: string, notes?: string) {
    const task = await this.approvals.findTaskById(taskId);
    if (!task) throw new ApprovalTaskNotFoundException(taskId);
    if (task.status !== ApprovalTaskStatus.PENDING) {
      throw new ApprovalValidationException('Task is not pending approval');
    }
    if (task.makerId === checkerId) {
      throw new MakerCheckerViolationException();
    }
    if (task.expiresAt && task.expiresAt < new Date()) {
      throw new ApprovalValidationException('Approval task has expired');
    }
    return this.approvals.decideTask(taskId, checkerId, 'APPROVED', notes);
  }

  async rejectTask(taskId: string, checkerId: string, notes?: string) {
    const task = await this.approvals.findTaskById(taskId);
    if (!task) throw new ApprovalTaskNotFoundException(taskId);
    if (task.status !== ApprovalTaskStatus.PENDING) {
      throw new ApprovalValidationException('Task is not pending approval');
    }
    if (task.makerId === checkerId) {
      throw new MakerCheckerViolationException();
    }
    return this.approvals.decideTask(taskId, checkerId, 'REJECTED', notes);
  }

  async getTask(taskId: string) {
    const task = await this.approvals.findTaskById(taskId);
    if (!task) throw new ApprovalTaskNotFoundException(taskId);
    return task;
  }

  async listTasks(
    acquirerId: string,
    status?: ApprovalTaskStatus,
    entityType?: ApprovalEntityType,
    page = 1,
    limit = 20,
  ) {
    return this.approvals.findMany(acquirerId, status, entityType, page, limit);
  }
}
