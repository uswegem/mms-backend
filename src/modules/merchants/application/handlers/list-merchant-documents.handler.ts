import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListMerchantDocumentsQuery } from '../queries/list-merchant-documents.query';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';
import { MerchantDocumentDto } from '../mappers/merchant-response.mapper';

@QueryHandler(ListMerchantDocumentsQuery)
export class ListMerchantDocumentsHandler
  implements IQueryHandler<ListMerchantDocumentsQuery>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
  ) {}

  async execute(query: ListMerchantDocumentsQuery): Promise<MerchantDocumentDto[]> {
    const merchant = await this.merchants.findById(query.merchantId);
    if (!merchant) throw new MerchantNotFoundException(query.merchantId);
    this.scope.assertCanAccessMerchant(query.actor, merchant);

    const docs = await this.merchants.listDocuments(query.merchantId);
    return docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSize: d.fileSize?.toString() ?? null,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
