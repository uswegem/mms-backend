import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class DeactivateUserCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly userId: string,
  ) {}
}
