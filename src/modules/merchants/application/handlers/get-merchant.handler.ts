import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetMerchantQuery } from '../queries/get-merchant.query';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@QueryHandler(GetMerchantQuery)
export class GetMerchantHandler implements IQueryHandler<GetMerchantQuery> {
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
  ) {}

  async execute(query: GetMerchantQuery) {
    const merchant = await this.merchants.findById(query.merchantId);
    if (!merchant) throw new MerchantNotFoundException(query.merchantId);
    this.scope.assertCanAccessMerchant(query.actor, merchant);
    return toMerchantResponse(merchant);
  }
}
