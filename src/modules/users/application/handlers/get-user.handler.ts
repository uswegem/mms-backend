import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetUserQuery } from '../queries/get-user.query';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserScopeService } from '../services/user-scope.service';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(
    private readonly users: UsersRepository,
    private readonly scope: UserScopeService,
  ) {}

  async execute(query: GetUserQuery): Promise<UserResponseDto> {
    const user = await this.users.findById(query.userId);
    if (!user) throw new UserNotFoundException(query.userId);
    this.scope.assertCanAccessUser(query.actor, user);
    return toUserResponse(user);
  }
}
