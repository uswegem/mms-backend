import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class AssignRolesCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly userId: string,
    public readonly roleIds: string[],
  ) {}
}
