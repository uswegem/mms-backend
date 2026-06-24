import { CommandHandler, ICommandHandler, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { createCipheriv, randomBytes } from 'crypto';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { ConfigService } from '@nestjs/config';
import { OnboardingRepository } from '../../infrastructure/persistence/onboarding.repository';
import { OnboardingWorkflowService } from '../services/onboarding-workflow.service';
import { toOnboardingResponse } from '../mappers/onboarding-response.mapper';
import {
  OnboardingForbiddenException,
  OnboardingNotFoundException,
} from '../../domain/exceptions/onboarding.exceptions';
import {
  AddBeneficialOwnerCommand,
  AddOnboardingDocumentCommand,
  AmlScreenOnboardingCommand,
  AssignSettlementAccountCommand,
  CreateOnboardingApplicationCommand,
  GetOnboardingApplicationQuery,
  GetOnboardingTimelineQuery,
  ListOnboardingApplicationsQuery,
  MakerApproveOnboardingCommand,
  RejectOnboardingCommand,
  ResubmitOnboardingCommand,
  SubmitOnboardingCommand,
  UpdateOnboardingApplicationCommand,
  VerifySettlementCommand,
} from '../commands/onboarding.commands';

function assertAcquirer(actor: { acquirerId: string }, acquirerId: string) {
  if (actor.acquirerId !== acquirerId) throw new OnboardingForbiddenException();
}

function encryptIdNumber(idNumber: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(idNumber, 'utf8'), cipher.final()]);
}

@CommandHandler(CreateOnboardingApplicationCommand)
export class CreateOnboardingApplicationHandler
  implements ICommandHandler<CreateOnboardingApplicationCommand>
{
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: CreateOnboardingApplicationCommand) {
    const { actor, dto } = command;
    const app = await this.onboarding.createApplication({
      acquirerId: actor.acquirerId,
      legalEntityType: dto.legalEntityType,
      isSchool: dto.isSchool ?? false,
      legalName: dto.legalName,
      tradingName: dto.tradingName,
      mcc: dto.mcc,
      city: dto.city,
      postalCode: dto.postalCode,
      taxId: dto.taxId,
      companyRegistrationNo: dto.companyRegistrationNo,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      createdBy: actor.sub,
    });
    await this.audit.record({
      actorId: actor.sub,
      action: 'ONBOARDING_APPLICATION_CREATED',
      entityType: 'onboarding_application',
      entityId: app.id,
      metadata: { applicationNo: app.applicationNo, legalEntityType: dto.legalEntityType },
    });
    return toOnboardingResponse(app);
  }
}

@CommandHandler(UpdateOnboardingApplicationCommand)
export class UpdateOnboardingApplicationHandler
  implements ICommandHandler<UpdateOnboardingApplicationCommand>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(command: UpdateOnboardingApplicationCommand) {
    const existing = await this.onboarding.findById(command.applicationId);
    if (!existing) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, existing.acquirerId);
    const app = await this.onboarding.updateApplication(command.applicationId, {
      ...command.dto,
      updatedBy: command.actor.sub,
    });
    return toOnboardingResponse(app);
  }
}

@CommandHandler(AddOnboardingDocumentCommand)
export class AddOnboardingDocumentHandler
  implements ICommandHandler<AddOnboardingDocumentCommand>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(command: AddOnboardingDocumentCommand) {
    const existing = await this.onboarding.findById(command.applicationId);
    if (!existing) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, existing.acquirerId);
    const doc = await this.onboarding.addDocument(command.applicationId, existing.merchantId, {
      ...command.dto,
      fileSize: command.dto.fileSize ? BigInt(command.dto.fileSize) : undefined,
      createdBy: command.actor.sub,
    });
    return {
      id: doc.id,
      docType: doc.docType,
      fileName: doc.fileName,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}

@CommandHandler(AddBeneficialOwnerCommand)
export class AddBeneficialOwnerHandler
  implements ICommandHandler<AddBeneficialOwnerCommand>
{
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(command: AddBeneficialOwnerCommand) {
    const existing = await this.onboarding.findById(command.applicationId);
    if (!existing) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, existing.acquirerId);
    const key =
      this.config.get<string>('MFA_ENCRYPTION_KEY') ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const owner = await this.onboarding.addBeneficialOwner(
      command.applicationId,
      command.dto.fullName,
      encryptIdNumber(command.dto.idNumber, key),
      command.dto.ownershipPct,
    );
    return {
      id: owner.id,
      fullName: owner.fullName,
      ownershipPct: owner.ownershipPct?.toString() ?? null,
    };
  }
}

@CommandHandler(AssignSettlementAccountCommand)
export class AssignSettlementAccountHandler
  implements ICommandHandler<AssignSettlementAccountCommand>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(command: AssignSettlementAccountCommand) {
    const existing = await this.onboarding.findById(command.applicationId);
    if (!existing) throw new OnboardingNotFoundException(command.applicationId);
    assertAcquirer(command.actor, existing.acquirerId);
    const account = await this.onboarding.assignSettlementAccount(
      existing.merchantId,
      { ...command.dto, createdBy: command.actor.sub },
      command.applicationId,
    );
    return {
      id: account.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankCode: account.bankCode,
    };
  }
}

@CommandHandler(VerifySettlementCommand)
export class VerifySettlementHandler
  implements ICommandHandler<VerifySettlementCommand>
{
  constructor(private readonly workflow: OnboardingWorkflowService) {}

  async execute(command: VerifySettlementCommand) {
    return this.workflow.verifySettlement(command.applicationId, command.actor.sub);
  }
}

@CommandHandler(AmlScreenOnboardingCommand)
export class AmlScreenOnboardingHandler
  implements ICommandHandler<AmlScreenOnboardingCommand>
{
  constructor(private readonly workflow: OnboardingWorkflowService) {}

  async execute(command: AmlScreenOnboardingCommand) {
    const result = await this.workflow.runAmlScreen(command.applicationId);
    return { result: result.result, screenedAt: result.screenedAt.toISOString() };
  }
}

@CommandHandler(SubmitOnboardingCommand)
export class SubmitOnboardingHandler implements ICommandHandler<SubmitOnboardingCommand> {
  constructor(
    private readonly workflow: OnboardingWorkflowService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: SubmitOnboardingCommand) {
    await this.workflow.verifySettlement(command.applicationId, command.actor.sub);
    const app = await this.workflow.submitForApproval(
      command.applicationId,
      command.actor.sub,
    );
    await this.audit.record({
      actorId: command.actor.sub,
      action: 'ONBOARDING_SUBMITTED',
      entityType: 'onboarding_application',
      entityId: command.applicationId,
    });
    return toOnboardingResponse(app);
  }
}

@CommandHandler(MakerApproveOnboardingCommand)
export class MakerApproveOnboardingHandler
  implements ICommandHandler<MakerApproveOnboardingCommand>
{
  constructor(
    private readonly workflow: OnboardingWorkflowService,
    private readonly onboarding: OnboardingRepository,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: MakerApproveOnboardingCommand) {
    await this.workflow.makerApprove(
      command.applicationId,
      command.actor.sub,
      command.actor.acquirerId,
    );
    const app = await this.onboarding.findById(command.applicationId);
    if (!app) throw new OnboardingNotFoundException(command.applicationId);
    await this.audit.record({
      actorId: command.actor.sub,
      action: 'ONBOARDING_MAKER_APPROVED',
      entityType: 'onboarding_application',
      entityId: command.applicationId,
    });
    return toOnboardingResponse(app);
  }
}

@CommandHandler(RejectOnboardingCommand)
export class RejectOnboardingHandler implements ICommandHandler<RejectOnboardingCommand> {
  constructor(
    private readonly workflow: OnboardingWorkflowService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: RejectOnboardingCommand) {
    const app = await this.workflow.rejectApplication(
      command.applicationId,
      command.actor.sub,
      command.rejectionCode,
      command.notes,
    );
    await this.audit.record({
      actorId: command.actor.sub,
      action: 'ONBOARDING_REJECTED',
      entityType: 'onboarding_application',
      entityId: command.applicationId,
      metadata: { rejectionCode: command.rejectionCode },
    });
    return toOnboardingResponse(app);
  }
}

@CommandHandler(ResubmitOnboardingCommand)
export class ResubmitOnboardingHandler
  implements ICommandHandler<ResubmitOnboardingCommand>
{
  constructor(private readonly workflow: OnboardingWorkflowService) {}

  async execute(command: ResubmitOnboardingCommand) {
    const app = await this.workflow.resubmit(command.applicationId, command.actor.sub);
    return toOnboardingResponse(app);
  }
}

@QueryHandler(ListOnboardingApplicationsQuery)
export class ListOnboardingApplicationsHandler
  implements IQueryHandler<ListOnboardingApplicationsQuery>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(query: ListOnboardingApplicationsQuery) {
    const { items, total } = await this.onboarding.findMany(
      query.actor.acquirerId,
      query.status,
      query.q,
      query.page,
      query.limit,
    );
    return {
      data: items.map(toOnboardingResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}

@QueryHandler(GetOnboardingApplicationQuery)
export class GetOnboardingApplicationHandler
  implements IQueryHandler<GetOnboardingApplicationQuery>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(query: GetOnboardingApplicationQuery) {
    const app = await this.onboarding.findById(query.applicationId);
    if (!app) throw new OnboardingNotFoundException(query.applicationId);
    assertAcquirer(query.actor, app.acquirerId);
    return toOnboardingResponse(app);
  }
}

@QueryHandler(GetOnboardingTimelineQuery)
export class GetOnboardingTimelineHandler
  implements IQueryHandler<GetOnboardingTimelineQuery>
{
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(query: GetOnboardingTimelineQuery) {
    const app = await this.onboarding.findById(query.applicationId);
    if (!app) throw new OnboardingNotFoundException(query.applicationId);
    assertAcquirer(query.actor, app.acquirerId);
    const timeline = await this.onboarding.getTimeline(query.applicationId);
    return {
      applicationId: query.applicationId,
      status: app.status,
      events: [
        { type: 'CREATED', at: app.createdAt.toISOString() },
        ...(app.submittedAt
          ? [{ type: 'SUBMITTED', at: app.submittedAt.toISOString() }]
          : []),
        ...timeline.reviews.map((r) => ({
          type: `REVIEW_${r.decision}`,
          at: r.reviewedAt.toISOString(),
          reviewerId: r.reviewerId,
          notes: r.notes,
        })),
        ...timeline.aml.map((a) => ({
          type: `AML_${a.result}`,
          at: a.screenedAt.toISOString(),
        })),
        ...timeline.steps
          .filter((s) => s.completedAt)
          .map((s) => ({
            type: `STEP_${s.stepCode}`,
            at: s.completedAt!.toISOString(),
          })),
        ...(app.approvedAt
          ? [{ type: 'APPROVED', at: app.approvedAt.toISOString() }]
          : []),
        ...(app.rejectedAt
          ? [{ type: 'REJECTED', at: app.rejectedAt.toISOString() }]
          : []),
      ],
    };
  }
}

export const ONBOARDING_HANDLERS = [
  CreateOnboardingApplicationHandler,
  UpdateOnboardingApplicationHandler,
  AddOnboardingDocumentHandler,
  AddBeneficialOwnerHandler,
  AssignSettlementAccountHandler,
  VerifySettlementHandler,
  AmlScreenOnboardingHandler,
  SubmitOnboardingHandler,
  MakerApproveOnboardingHandler,
  RejectOnboardingHandler,
  ResubmitOnboardingHandler,
  ListOnboardingApplicationsHandler,
  GetOnboardingApplicationHandler,
  GetOnboardingTimelineHandler,
];
