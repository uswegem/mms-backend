import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class SuspendMerchantCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
  ) {}
}
