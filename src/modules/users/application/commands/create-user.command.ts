import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class CreateUserCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly email: string,
    public readonly fullName: string,
    public readonly roleIds: string[],
    public readonly merchantId?: string,
    public readonly phone?: string,
    public readonly password?: string,
  ) {}
}
