import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import {
  AddBeneficialOwnerDto,
  AddOnboardingDocumentDto,
  AssignSettlementAccountDto,
  CreateOnboardingApplicationDto,
  UpdateOnboardingApplicationDto,
} from '../../presentation/dto/onboarding.dto';
import { OnboardingStatus } from '@prisma/client';

export class CreateOnboardingApplicationCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly dto: CreateOnboardingApplicationDto,
  ) {}
}

export class UpdateOnboardingApplicationCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly dto: UpdateOnboardingApplicationDto,
  ) {}
}

export class AddOnboardingDocumentCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly dto: AddOnboardingDocumentDto,
  ) {}
}

export class AddBeneficialOwnerCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly dto: AddBeneficialOwnerDto,
  ) {}
}

export class AssignSettlementAccountCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly dto: AssignSettlementAccountDto,
  ) {}
}

export class VerifySettlementCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class VerifyBeneficialOwnerNidaCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly beneficialOwnerId: string,
  ) {}
}

export class VerifyTinCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class AmlScreenOnboardingCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class SubmitOnboardingCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class MakerApproveOnboardingCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class RejectOnboardingCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
    public readonly rejectionCode: string,
    public readonly notes?: string,
  ) {}
}

export class ResubmitOnboardingCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class ListOnboardingApplicationsQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly page: number,
    public readonly limit: number,
    public readonly status?: OnboardingStatus,
    public readonly q?: string,
    public readonly onboardingType?: 'MERCHANT' | 'SCHOOL',
  ) {}
}

export class GetOnboardingApplicationQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}

export class GetOnboardingTimelineQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly applicationId: string,
  ) {}
}
