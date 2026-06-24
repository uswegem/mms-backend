import { ApprovalTaskWithDecision } from '../../infrastructure/persistence/approvals.repository';
import { ApprovalTaskResponseDto } from '../../presentation/dto/approval.dto';

export function toApprovalTaskResponse(
  task: ApprovalTaskWithDecision,
): ApprovalTaskResponseDto {
  return {
    id: task.id,
    acquirerId: task.acquirerId,
    entityType: task.entityType,
    entityId: task.entityId,
    makerId: task.makerId,
    status: task.status,
    expiresAt: task.expiresAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    decision: task.decision
      ? {
          checkerId: task.decision.checkerId,
          decision: task.decision.decision,
          notes: task.decision.notes,
          decidedAt: task.decision.decidedAt.toISOString(),
        }
      : null,
  };
}
