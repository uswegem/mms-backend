import { ApprovalEntityType, ApprovalTaskStatus } from '@prisma/client';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ListApprovalTasksQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly page: number,
    public readonly limit: number,
    public readonly status?: ApprovalTaskStatus,
    public readonly entityType?: ApprovalEntityType,
  ) {}
}
