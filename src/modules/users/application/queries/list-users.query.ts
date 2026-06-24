import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ListUsersQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
