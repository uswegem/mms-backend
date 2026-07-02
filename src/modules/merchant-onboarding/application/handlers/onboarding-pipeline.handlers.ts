import { CommandHandler, ICommandHandler, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { OnboardingRepository } from '../../infrastructure/persistence/onboarding.repository';
import { OnboardingPipelineService } from '../services/onboarding-pipeline.service';
import { OnboardingAuditService } from '../services/onboarding-audit.service';
import { toOnboardingResponse } from '../mappers/onboarding-response.mapper';
import {
  ActivateOnboardingCommand,
  BulkStoreUploadCommand,
  DeleteOnboardingDocumentCommand,
  GetOnboardingAuditLogsQuery,
  GetOnboardingDashboardQuery,
  KycDecisionCommand,
  KycRejectPipelineCommand,
  KycSendBackCommand,
  PipelineActionCommand,
  RiskDecisionCommand,
  SettlementConfigCommand,
} from '../commands/onboarding-pipeline.commands';
import {
  OnboardingForbiddenException,
  OnboardingNotFoundException,
  OnboardingValidationException,
} from '../../domain/exceptions/onboarding.exceptions';

function assertAcquirer(actor: { acquirerId: string }, acquirerId: string) {
  if (actor.acquirerId !== acquirerId) throw new OnboardingForbiddenException();
}

@CommandHandler(KycDecisionCommand)
export class KycApproveHandler implements ICommandHandler<KycDecisionCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: KycDecisionCommand) {
    const app = await this.pipeline.approveKyc(
      command.applicationId,
      command.actor.sub,
      command.actor.acquirerId,
      command.remarks,
    );
    return toOnboardingResponse(app);
  }
}

@CommandHandler(KycRejectPipelineCommand)
export class KycRejectPipelineHandler implements ICommandHandler<KycRejectPipelineCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: KycRejectPipelineCommand) {
    const app = await this.pipeline.rejectKyc(
      command.applicationId,
      command.actor.sub,
      command.rejectionCode ?? 'INCOMPLETE_KYC',
      command.remarks,
    );
    return toOnboardingResponse(app);
  }
}

@CommandHandler(KycSendBackCommand)
export class KycSendBackHandler implements ICommandHandler<KycSendBackCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: KycSendBackCommand) {
    if (!command.remarks?.trim()) {
      throw new OnboardingValidationException('Send-back requires remarks');
    }
    const app = await this.pipeline.sendBackKyc(
      command.applicationId,
      command.actor.sub,
      command.remarks,
    );
    return toOnboardingResponse(app);
  }
}

@CommandHandler(RiskDecisionCommand)
export class RiskApproveHandler implements ICommandHandler<RiskDecisionCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: RiskDecisionCommand) {
    const app = await this.pipeline.approveRisk(
      command.applicationId,
      command.actor.sub,
      command.data,
    );
    return toOnboardingResponse(app);
  }
}

@CommandHandler(SettlementConfigCommand)
export class SaveSettlementHandler implements ICommandHandler<SettlementConfigCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: SettlementConfigCommand) {
    const app = await this.pipeline.saveSettlement(
      command.applicationId,
      command.actor.sub,
      command.data,
    );
    return toOnboardingResponse(app);
  }
}

@CommandHandler(ActivateOnboardingCommand)
export class ActivateOnboardingHandler implements ICommandHandler<ActivateOnboardingCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: ActivateOnboardingCommand) {
    const app = await this.pipeline.activate(command.applicationId, command.actor.sub);
    return toOnboardingResponse(app);
  }
}

@CommandHandler(DeleteOnboardingDocumentCommand)
export class DeleteDocumentHandler implements ICommandHandler<DeleteOnboardingDocumentCommand> {
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(command: DeleteOnboardingDocumentCommand) {
    const app = await this.onboarding.findById(command.applicationId);
    if (!app) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, app.acquirerId);
    await this.onboarding.deleteDocument(
      command.documentId,
      app.merchantId,
      command.actor.sub,
    );
    const refreshed = await this.onboarding.findById(command.applicationId);
    return toOnboardingResponse(refreshed!);
  }
}

@CommandHandler(BulkStoreUploadCommand)
export class BulkStoreUploadHandler implements ICommandHandler<BulkStoreUploadCommand> {
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(command: BulkStoreUploadCommand) {
    const app = await this.onboarding.findById(command.applicationId);
    if (!app) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, app.acquirerId);
    const stores = await this.onboarding.bulkCreateStores(
      app.merchantId,
      command.stores,
      command.actor.sub,
    );
    return { imported: stores.length, stores };
  }
}

@CommandHandler(PipelineActionCommand)
export class PipelineActionHandler implements ICommandHandler<PipelineActionCommand> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(command: PipelineActionCommand) {
    const { applicationId, actor, action } = command;
    let app;
    switch (action) {
      case 'bank_validate':
        app = await this.pipeline.runBankValidation(applicationId, actor.sub);
        break;
      case 'tps_register':
        app = await this.pipeline.registerTps(applicationId, actor.sub);
        break;
      case 'tps_retry':
        app = await this.pipeline.retryTps(applicationId, actor.sub);
        break;
      case 'alias_qr_register':
        app = await this.pipeline.registerAliasQr(applicationId, actor.sub);
        break;
      case 'alias_qr_retry':
        app = await this.pipeline.retryAliasQr(applicationId, actor.sub);
        break;
      case 'settlement_submit':
        app = await this.pipeline.submitSettlement(applicationId, actor.sub);
        break;
      case 'risk_reject':
        app = await this.pipeline.rejectRisk(applicationId, actor.sub, command.remarks);
        break;
      case 'settlement_approve':
        app = await this.pipeline.approveSettlement(applicationId, actor.sub, command.remarks);
        break;
      case 'settlement_reject':
        app = await this.pipeline.rejectSettlement(applicationId, actor.sub, command.remarks);
        break;
      case 'kyc_send_back':
        app = await this.pipeline.sendBackKyc(applicationId, actor.sub, command.remarks);
        break;
      case 'risk_send_back':
        app = await this.pipeline.sendBackRisk(applicationId, actor.sub, command.remarks);
        break;
    }
    return toOnboardingResponse(app!);
  }
}

@QueryHandler(GetOnboardingDashboardQuery)
export class GetDashboardHandler implements IQueryHandler<GetOnboardingDashboardQuery> {
  constructor(private readonly pipeline: OnboardingPipelineService) {}

  async execute(query: GetOnboardingDashboardQuery) {
    return this.pipeline.getDashboardStats(query.actor.acquirerId);
  }
}

@QueryHandler(GetOnboardingAuditLogsQuery)
export class GetAuditLogsHandler implements IQueryHandler<GetOnboardingAuditLogsQuery> {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly audit: OnboardingAuditService,
  ) {}

  async execute(query: GetOnboardingAuditLogsQuery) {
    const app = await this.onboarding.findById(query.applicationId);
    if (!app) throw new OnboardingNotFoundException(query.applicationId);
    assertAcquirer(query.actor, app.acquirerId);
    return this.audit.list(query.applicationId);
  }
}

export const ONBOARDING_PIPELINE_HANDLERS = [
  KycApproveHandler,
  KycRejectPipelineHandler,
  KycSendBackHandler,
  RiskApproveHandler,
  SaveSettlementHandler,
  ActivateOnboardingHandler,
  DeleteDocumentHandler,
  BulkStoreUploadHandler,
  PipelineActionHandler,
  GetDashboardHandler,
  GetAuditLogsHandler,
];
