import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class UpdateMerchantCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
    public readonly tradingName?: string,
    public readonly mcc?: string,
    public readonly taxId?: string,
    public readonly region?: string,
    public readonly district?: string,
    public readonly ward?: string,
    public readonly city?: string,
    public readonly postalCode?: string,
    public readonly addressLine1?: string,
    public readonly addressLine2?: string,
    public readonly contactPhone?: string,
    public readonly contactEmail?: string,
  ) {}
}
