import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListUsersQuery } from '../queries/list-users.query';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

export interface PaginatedUsersResult {
  data: UserResponseDto[];
  meta: { page: number; limit: number; total: number };
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery> {
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
  ) {}

  async execute(query: ListUsersQuery): Promise<PaginatedUsersResult> {
    const filter = this.scope.listFilter(query.actor);
    const { items, total } = await this.users.findMany(
      filter,
      query.page,
      query.limit,
    );
    return {
      data: items.map(toUserResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
