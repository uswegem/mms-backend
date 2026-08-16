import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { MerchantOnboardingModule } from '@modules/merchant-onboarding/merchant-onboarding.module';
import { AliasModule } from '@modules/alias/alias.module';
import { QrModule } from '@modules/qr/qr.module';
import { AuditModule } from '@infrastructure/audit/audit.module';
import { MerchantsModule } from '@modules/merchants/merchants.module';
import { MakerCheckerModule } from '@modules/maker-checker/maker-checker.module';
import { SCHOOL_ONBOARDING_COMPLETION_PORT } from '@modules/maker-checker/application/ports/school-onboarding-completion.port';
import { RECON_EXCEPTION_APPROVAL_PORT } from '@modules/maker-checker/application/ports/recon-exception-approval.port';
import { SchoolsController } from './presentation/http/schools.controller';
import { StudentsController } from './presentation/http/students.controller';
import { SchoolsRepository } from './infrastructure/persistence/schools.repository';
import { StudentAliasService } from './application/services/student-alias.service';
import { BulkStudentUploadService } from './application/services/bulk-student-upload.service';
import { SchoolIssuanceService } from './application/services/school-issuance.service';
import { SchoolAccessService } from './application/services/school-access.service';
import { AcademicStructureService } from './application/services/academic-structure.service';
import { FeeStructureService } from './application/services/fee-structure.service';
import { StudentRegistryService } from './application/services/student-registry.service';
import { InvoiceService } from './application/services/invoice.service';
import { InvoicePaymentService } from './application/services/invoice-payment.service';
import { ReferenceService } from './application/services/reference.service';
import { ReferenceResolutionService } from './application/services/reference-resolution.service';
import { ReferenceAdminService } from './application/services/reference-admin.service';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { MockPaymentGateway } from './infrastructure/payment-gateway/mock-payment-gateway.service';
import { AcademicStructureController } from './presentation/http/academic-structure.controller';
import { FeeStructuresController } from './presentation/http/fee-structures.controller';
import { FeeInvoicesController } from './presentation/http/fee-invoices.controller';
import { FeePaymentsController } from './presentation/http/fee-payments.controller';
import { StudentRegistryController } from './presentation/http/student-registry.controller';
import { FeeReferencesController } from './presentation/http/fee-references.controller';
import { PaymentLedgerController } from './presentation/http/payment-ledger.controller';
import { ReconciliationController } from './presentation/http/reconciliation.controller';
import { PaymentLedgerService } from './application/services/payment-ledger.service';
import { DailyCollectionSnapshotService } from './application/services/daily-collection-snapshot.service';
import { SettlementIngestionService } from './application/services/settlement-ingestion.service';
import { ReconciliationService } from './application/services/reconciliation.service';
import { ReconSimFeedService } from './application/services/recon-sim-feed.service';
import { ExceptionCaseService } from './application/services/exception-case.service';
import { ExceptionResolutionService } from './application/services/exception-resolution.service';
import { ReconExceptionApprovalAdapter } from './application/services/recon-exception-approval.adapter';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    AuthModule,
    forwardRef(() => MerchantOnboardingModule),
    AliasModule,
    QrModule,
    AuditModule,
    MerchantsModule,
    forwardRef(() => MakerCheckerModule),
  ],
  controllers: [
    SchoolsController,
    StudentsController,
    StudentRegistryController,
    AcademicStructureController,
    FeeStructuresController,
    FeeInvoicesController,
    FeePaymentsController,
    FeeReferencesController,
    PaymentLedgerController,
    ReconciliationController,
  ],
  providers: [
    SchoolsRepository,
    StudentAliasService,
    BulkStudentUploadService,
    SchoolIssuanceService,
    SchoolAccessService,
    AcademicStructureService,
    FeeStructureService,
    StudentRegistryService,
    ReferenceService,
    ReferenceResolutionService,
    ReferenceAdminService,
    InvoiceService,
    InvoicePaymentService,
    PaymentLedgerService,
    DailyCollectionSnapshotService,
    SettlementIngestionService,
    ExceptionCaseService,
    ExceptionResolutionService,
    ReconExceptionApprovalAdapter,
    ReconciliationService,
    ReconSimFeedService,
    MockPaymentGateway,
    { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGateway },
    {
      provide: SCHOOL_ONBOARDING_COMPLETION_PORT,
      useExisting: SchoolIssuanceService,
    },
    {
      provide: RECON_EXCEPTION_APPROVAL_PORT,
      useExisting: ReconExceptionApprovalAdapter,
    },
  ],
  exports: [
    SchoolsRepository,
    StudentAliasService,
    SchoolIssuanceService,
    ReferenceService,
    ReferenceResolutionService,
    SCHOOL_ONBOARDING_COMPLETION_PORT,
    RECON_EXCEPTION_APPROVAL_PORT,
  ],
})
export class SchoolFeesModule {}
