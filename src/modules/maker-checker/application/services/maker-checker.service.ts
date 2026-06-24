import { Injectable } from '@nestjs/common';
import { ApprovalEntityType, ApprovalTaskStatus } from '@prisma/client';
import { ApprovalsRepository } from '../../infrastructure/persistence/approvals.repository';
import {
  ApprovalTaskNotFoundException,
  ApprovalValidationException,
  MakerCheckerViolationException,
} from '../../domain/exceptions/approval.exceptions';

@Injectable()
export class MakerCheckerService {
  constructor(private readonly approvals: ApprovalsRepository) {}

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
