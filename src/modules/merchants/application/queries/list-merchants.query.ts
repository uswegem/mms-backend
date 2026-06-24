import { MerchantStatus } from '@prisma/client';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ListMerchantsQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly page: number,
    public readonly limit: number,
    public readonly status?: MerchantStatus,
    public readonly q?: string,
  ) {}
}
