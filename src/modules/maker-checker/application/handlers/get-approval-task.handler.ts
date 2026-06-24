import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetApprovalTaskQuery } from '../queries/get-approval-task.query';
import { MakerCheckerService } from '../services/maker-checker.service';
import { toApprovalTaskResponse } from '../mappers/approval-response.mapper';
import { ApprovalForbiddenException } from '../../domain/exceptions/approval.exceptions';

@QueryHandler(GetApprovalTaskQuery)
export class GetApprovalTaskHandler implements IQueryHandler<GetApprovalTaskQuery> {
  constructor(private readonly makerChecker: MakerCheckerService) {}

  async execute(query: GetApprovalTaskQuery) {
    const task = await this.makerChecker.getTask(query.taskId);
    if (task.acquirerId !== query.actor.acquirerId) {
      throw new ApprovalForbiddenException();
    }
    return toApprovalTaskResponse(task);
  }
}
