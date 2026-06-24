import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class InviteUserCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly email: string,
    public readonly roleId: string,
    public readonly merchantId?: string,
  ) {}
}
