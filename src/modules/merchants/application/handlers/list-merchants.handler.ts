import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListMerchantsQuery } from '../queries/list-merchants.query';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { toMerchantResponse } from '../mappers/merchant-response.mapper';

@QueryHandler(ListMerchantsQuery)
export class ListMerchantsHandler implements IQueryHandler<ListMerchantsQuery> {
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
  ) {}

  async execute(query: ListMerchantsQuery) {
    const base = this.scope.listFilter(query.actor);
    const { items, total } = await this.merchants.findMany(
      { ...base, status: query.status, q: query.q },
      query.page,
      query.limit,
    );
    return {
      data: items.map(toMerchantResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
