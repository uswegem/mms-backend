import { Injectable } from '@nestjs/common';
import { ApprovalEntityType, ApprovalTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

const taskInclude = {
  decision: true,
} satisfies Prisma.ApprovalTaskInclude;

export type ApprovalTaskWithDecision = Prisma.ApprovalTaskGetPayload<{
  include: typeof taskInclude;
}>;

@Injectable()
export class ApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicy(acquirerId: string, entityType: ApprovalEntityType) {
    return this.prisma.approvalPolicy.findUnique({
      where: {
        acquirerId_entityType: { acquirerId, entityType },
      },
    });
  }

  async listPolicies(acquirerId: string, entityTypes: ApprovalEntityType[]) {
    return this.prisma.approvalPolicy.findMany({
      where: { acquirerId, entityType: { in: entityTypes } },
    });
  }

  async upsertPolicy(
    acquirerId: string,
    entityType: ApprovalEntityType,
    enabled: boolean,
    slaHours: number,
  ) {
    return this.prisma.approvalPolicy.upsert({
      where: { acquirerId_entityType: { acquirerId, entityType } },
      update: { enabled, slaHours },
      create: { acquirerId, entityType, enabled, slaHours },
    });
  }

  async createTask(data: {
    acquirerId: string;
    entityType: ApprovalEntityType;
    entityId: string;
    makerId: string;
    slaHours: number;
  }): Promise<ApprovalTaskWithDecision> {
    const expiresAt = new Date(Date.now() + data.slaHours * 60 * 60 * 1000);
    return this.prisma.approvalTask.create({
      data: {
        acquirerId: data.acquirerId,
        entityType: data.entityType,
        entityId: data.entityId,
        makerId: data.makerId,
        expiresAt,
        status: ApprovalTaskStatus.PENDING,
      },
      include: taskInclude,
    });
  }

  async findTaskById(id: string): Promise<ApprovalTaskWithDecision | null> {
    return this.prisma.approvalTask.findUnique({
      where: { id },
      include: taskInclude,
    });
  }

  async findPendingByEntity(
    entityType: ApprovalEntityType,
    entityId: string,
  ): Promise<ApprovalTaskWithDecision | null> {
    return this.prisma.approvalTask.findFirst({
      where: {
        entityType,
        entityId,
        status: ApprovalTaskStatus.PENDING,
      },
      include: taskInclude,
    });
  }

  async findMany(
    acquirerId: string,
    status?: ApprovalTaskStatus,
    entityType?: ApprovalEntityType,
    page = 1,
    limit = 20,
  ) {
    const where: Prisma.ApprovalTaskWhereInput = {
      acquirerId,
      ...(status ? { status } : {}),
      ...(entityType ? { entityType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.approvalTask.findMany({
        where,
        include: taskInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.approvalTask.count({ where }),
    ]);
    return { items, total };
  }

  async decideTask(
    taskId: string,
    checkerId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string,
  ): Promise<ApprovalTaskWithDecision> {
    return this.prisma.$transaction(async (tx) => {
      await tx.approvalDecision.create({
        data: { taskId, checkerId, decision, notes },
      });
      return tx.approvalTask.update({
        where: { id: taskId },
        data: {
          status:
            decision === 'APPROVED'
              ? ApprovalTaskStatus.APPROVED
              : ApprovalTaskStatus.REJECTED,
        },
        include: taskInclude,
      });
    });
  }
}
