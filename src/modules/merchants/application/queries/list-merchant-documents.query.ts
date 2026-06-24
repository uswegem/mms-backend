import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ListMerchantDocumentsQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
  ) {}
}
