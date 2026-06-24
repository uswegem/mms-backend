import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class SubmitKycCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
  ) {}
}
