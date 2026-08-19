import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListApprovalTasksQuery } from '../queries/list-approval-tasks.query';
import { MakerCheckerService } from '../services/maker-checker.service';
import { toApprovalTaskResponse } from '../mappers/approval-response.mapper';

@QueryHandler(ListApprovalTasksQuery)
export class ListApprovalTasksHandler implements IQueryHandler<ListApprovalTasksQuery> {
  constructor(private readonly makerChecker: MakerCheckerService) {}

  async execute(query: ListApprovalTasksQuery) {
    const { items, total } = await this.makerChecker.listTasks(
      query.actor.acquirerId,
      query.status,
      query.entityType,
      query.page,
      query.limit,
    );
    return {
      data: items.map(toApprovalTaskResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
