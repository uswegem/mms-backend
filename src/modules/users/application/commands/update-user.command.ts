import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class UpdateUserCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly userId: string,
    public readonly fullName?: string,
    public readonly phone?: string,
  ) {}
}
