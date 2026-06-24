import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class GetApprovalTaskQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly taskId: string,
  ) {}
}
