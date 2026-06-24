import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListKycReviewsQuery } from '../queries/list-kyc-reviews.query';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { MerchantKycReviewDto } from '../../presentation/dto/merchant.dto';

@QueryHandler(ListKycReviewsQuery)
export class ListKycReviewsHandler
  implements IQueryHandler<ListKycReviewsQuery>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
  ) {}

  async execute(query: ListKycReviewsQuery): Promise<MerchantKycReviewDto[]> {
    const merchant = await this.merchants.findById(query.merchantId);
    if (!merchant) throw new MerchantNotFoundException(query.merchantId);
    this.scope.assertCanAccessMerchant(query.actor, merchant);

    const reviews = await this.merchants.listKycReviews(query.merchantId);
    return reviews.map((r) => ({
      id: r.id,
      reviewerId: r.reviewerId,
      decision: r.decision,
      notes: r.notes,
      reviewedAt: r.reviewedAt.toISOString(),
    }));
  }
}
