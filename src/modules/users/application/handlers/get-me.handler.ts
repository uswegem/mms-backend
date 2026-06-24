import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetMeQuery } from '../queries/get-me.query';
import { UsersRepository } from '../../infrastructure/persistence/users.repository';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions';
import {
  toUserResponse,
  UserResponseDto,
} from '../mappers/user-response.mapper';

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery> {
  constructor(private readonly users: UsersRepository) {}

  async execute(query: GetMeQuery): Promise<UserResponseDto> {
    const user = await this.users.findById(query.actor.sub);
    if (!user) throw new UserNotFoundException(query.actor.sub);
    return toUserResponse(user);
  }
}
