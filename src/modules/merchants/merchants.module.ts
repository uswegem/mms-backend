import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantStatusModule } from '@modules/merchant-status/merchant-status.module';
import { ReferenceDataModule } from '@modules/reference-data/reference-data.module';
import { MerchantsController } from './presentation/http/merchants.controller';
import { MerchantsRepository } from './infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from './application/services/merchant-scope.service';
import { ListMerchantsHandler } from './application/handlers/list-merchants.handler';
import { GetMerchantHandler } from './application/handlers/get-merchant.handler';
import { ListMerchantDocumentsHandler } from './application/handlers/list-merchant-documents.handler';
import { ListKycReviewsHandler } from './application/handlers/list-kyc-reviews.handler';
import { CreateMerchantHandler } from './application/handlers/create-merchant.handler';
import { UpdateMerchantHandler } from './application/handlers/update-merchant.handler';
import { AddKycDocumentHandler } from './application/handlers/add-kyc-document.handler';
import { SubmitKycHandler } from './application/handlers/submit-kyc.handler';
import { ReviewKycHandler } from './application/handlers/review-kyc.handler';

const QueryHandlers = [
  ListMerchantsHandler,
  GetMerchantHandler,
  ListMerchantDocumentsHandler,
  ListKycReviewsHandler,
];
const CommandHandlers = [
  CreateMerchantHandler,
  UpdateMerchantHandler,
  AddKycDocumentHandler,
  SubmitKycHandler,
  ReviewKycHandler,
];

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    AuditModule,
    MerchantStatusModule,
    ReferenceDataModule,
  ],
  controllers: [MerchantsController],
  providers: [
    MerchantsRepository,
    MerchantScopeService,
    ...QueryHandlers,
    ...CommandHandlers,
  ],
  exports: [MerchantsRepository, MerchantScopeService],
})
export class MerchantsModule {}
