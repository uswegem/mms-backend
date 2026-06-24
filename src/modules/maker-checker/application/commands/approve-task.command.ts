import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ApproveTaskCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly taskId: string,
    public readonly notes?: string,
  ) {}
}
