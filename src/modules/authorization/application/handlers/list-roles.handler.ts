import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListRolesQuery } from '../queries/list-roles.query';
import { RolesRepository } from '../../infrastructure/persistence/roles.repository';

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery> {
  constructor(private readonly roles: RolesRepository) {}

  async execute(query: ListRolesQuery): Promise<RoleListItem[]> {
    return this.roles.findAll(query.acquirerId);
  }
}
