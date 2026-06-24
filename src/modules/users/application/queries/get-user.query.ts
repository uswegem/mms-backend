import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class GetUserQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly userId: string,
  ) {}
}
