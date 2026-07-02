import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class KycDecisionCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly remarks?: string,
    readonly rejectionCode?: string,
  ) {}
}

export class RiskDecisionCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly data: {
      riskScore?: number;
      riskLevel?: string;
      duplicateFlag?: boolean;
      blacklistFlag?: boolean;
      remarks?: string;
    },
  ) {}
}

export class SettlementConfigCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly data: {
      settlementAlias?: string;
      settlementAccountId?: string;
      payoutCycle?: string;
      mdr?: number;
      charges?: number;
      transactionLimit?: number;
      dailyLimit?: number;
    },
  ) {}
}

export class ActivateOnboardingCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
  ) {}
}

export class DeleteOnboardingDocumentCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly documentId: string,
  ) {}
}

export class BulkStoreUploadCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly stores: Array<{ storeName: string; storeCode: string }>,
  ) {}
}

export class GetOnboardingDashboardQuery {
  constructor(readonly actor: ActorContext) {}
}

export class GetOnboardingAuditLogsQuery {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
  ) {}
}

export class KycSendBackCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly remarks?: string,
  ) {}
}

export class KycRejectPipelineCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly rejectionCode?: string,
    readonly remarks?: string,
  ) {}
}

export class PipelineActionCommand {
  constructor(
    readonly actor: ActorContext,
    readonly applicationId: string,
    readonly action:
      | 'bank_validate'
      | 'tps_register'
      | 'tps_retry'
      | 'alias_qr_register'
      | 'alias_qr_retry'
      | 'settlement_submit'
      | 'risk_reject'
      | 'settlement_approve'
      | 'settlement_reject'
      | 'kyc_send_back'
      | 'risk_send_back',
    readonly remarks?: string,
  ) {}
}
