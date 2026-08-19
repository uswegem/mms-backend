import { Module } from '@nestjs/common';
import { IdentityModule } from './identity/identity.module';
import { UsersModule } from './users/users.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { MerchantsModule } from './merchants/merchants.module';
import { MerchantStatusModule } from './merchant-status/merchant-status.module';
import { MerchantOnboardingModule } from './merchant-onboarding/merchant-onboarding.module';
import { QrModule } from './qr/qr.module';
import { AliasModule } from './alias/alias.module';
import { SchoolFeesModule } from './school-fees/school-fees.module';
import { TransactionsModule } from './transactions/transactions.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ReportingModule } from './reporting/reporting.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MakerCheckerModule } from './maker-checker/maker-checker.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { TipsModule } from './tips/tips.module';
import { CbsModule } from './cbs/cbs.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ReferenceDataModule } from './reference-data/reference-data.module';
import { TransactionLimitsModule } from './transaction-limits/transaction-limits.module';
import { FeeSchedulesModule } from './fee-schedules/fee-schedules.module';
import { DisputesModule } from './disputes/disputes.module';

/**
 * Registers all bounded-context modules (structure only — no business logic).
 */
@Module({
  imports: [
    IdentityModule,
    UsersModule,
    AuthorizationModule,
    MerchantsModule,
    MerchantStatusModule,
    MerchantOnboardingModule,
    QrModule,
    AliasModule,
    SchoolFeesModule,
    TransactionsModule,
    SettlementsModule,
    ReconciliationModule,
    ReportingModule,
    DashboardModule,
    NotificationsModule,
    MakerCheckerModule,
    ConfigurationModule,
    TipsModule,
    CbsModule,
    MonitoringModule,
    ReferenceDataModule,
    TransactionLimitsModule,
    FeeSchedulesModule,
    DisputesModule,
  ],
})
export class ModulesModule {}
