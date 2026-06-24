import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class ReviewKycCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
    public readonly decision: 'APPROVED' | 'REJECTED' | 'MORE_INFO',
    public readonly notes?: string,
  ) {}
}
