import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { CreateOnboardingApplicationCommand } from '../../application/commands/create-onboarding-application.command';
import { UpdateOnboardingApplicationCommand } from '../../application/commands/update-onboarding-application.command';
import { AddOnboardingDocumentCommand } from '../../application/commands/add-onboarding-document.command';
import { AddBeneficialOwnerCommand } from '../../application/commands/add-beneficial-owner.command';
import { AssignSettlementAccountCommand } from '../../application/commands/assign-settlement-account.command';
import { SubmitOnboardingCommand } from '../../application/commands/submit-onboarding.command';
import { MakerApproveOnboardingCommand } from '../../application/commands/maker-approve-onboarding.command';
import { RejectOnboardingCommand } from '../../application/commands/reject-onboarding.command';
import { ResubmitOnboardingCommand } from '../../application/commands/resubmit-onboarding.command';
import { AmlScreenOnboardingCommand } from '../../application/commands/aml-screen-onboarding.command';
import { VerifySettlementCommand } from '../../application/commands/verify-settlement.command';
import { VerifyBeneficialOwnerNidaCommand } from '../../application/commands/verify-beneficial-owner-nida.command';
import { VerifyTinCommand } from '../../application/commands/verify-tin.command';
import { AcceptFeeScheduleCommand } from '../../application/commands/accept-fee-schedule.command';
import { ListOnboardingApplicationsQuery } from '../../application/queries/list-onboarding-applications.query';
import { GetOnboardingApplicationQuery } from '../../application/queries/get-onboarding-application.query';
import { GetOnboardingTimelineQuery } from '../../application/queries/get-onboarding-timeline.query';
import { GetApplicationFeeScheduleQuery } from '../../application/queries/get-application-fee-schedule.query';
import { GetOnboardingDashboardQuery } from '../../application/commands/onboarding-pipeline.commands';
import {
  AddBeneficialOwnerDto,
  AddOnboardingDocumentDto,
  AssignSettlementAccountDto,
  CreateOnboardingApplicationDto,
  ListOnboardingQueryDto,
  RejectOnboardingDto,
  UpdateOnboardingApplicationDto,
} from '../dto/onboarding.dto';

function toActor(user: JwtPayload): ActorContext {
  return {
    sub: user.sub,
    email: user.email,
    acquirerId: user.acquirerId,
    merchantId: user.merchantId,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiTags('Onboarding')
@ApiBearerAuth('access-token')
@Controller('onboarding/applications')
export class OnboardingController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @RequirePermissions(Permission.ONBOARDING_READ)
  @ApiOperation({ summary: 'List onboarding applications' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListOnboardingQueryDto,
  ) {
    return this.queryBus.execute(
      new ListOnboardingApplicationsQuery(
        toActor(user),
        query.page ?? 1,
        query.limit ?? 20,
        query.status,
        query.q,
        query.onboardingType,
      ),
    );
  }

  @Get('dashboard/stats')
  @RequirePermissions(Permission.ONBOARDING_READ)
  @ApiOperation({ summary: 'Onboarding dashboard status counts' })
  async dashboard(@CurrentUser() user: JwtPayload) {
    return this.queryBus.execute(new GetOnboardingDashboardQuery(toActor(user)));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Create onboarding application (sole proprietor or company)' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOnboardingApplicationDto,
  ) {
    return this.commandBus.execute(
      new CreateOnboardingApplicationCommand(toActor(user), dto),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.ONBOARDING_READ)
  @ApiOperation({ summary: 'Get onboarding application detail' })
  async getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queryBus.execute(new GetOnboardingApplicationQuery(toActor(user), id));
  }

  @Put(':id')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Update onboarding application profile' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOnboardingApplicationDto,
  ) {
    return this.commandBus.execute(
      new UpdateOnboardingApplicationCommand(toActor(user), id, dto),
    );
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Register KYC document' })
  async addDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOnboardingDocumentDto,
  ) {
    return this.commandBus.execute(
      new AddOnboardingDocumentCommand(toActor(user), id, dto),
    );
  }

  @Post(':id/beneficial-owners')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Add beneficial owner (company registration)' })
  async addOwner(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBeneficialOwnerDto,
  ) {
    return this.commandBus.execute(
      new AddBeneficialOwnerCommand(toActor(user), id, dto),
    );
  }

  @Post(':id/beneficial-owners/:ownerId/verify-nida')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({
    summary: 'Verify a beneficial owner’s national ID against NIDA (brief §4.3, Step 2)',
  })
  async verifyBeneficialOwnerNida(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
  ) {
    return this.commandBus.execute(
      new VerifyBeneficialOwnerNidaCommand(toActor(user), id, ownerId),
    );
  }

  @Post(':id/verify-tin')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Verify TIN against TRA (brief §4.3, Step 3)' })
  async verifyTin(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new VerifyTinCommand(toActor(user), id));
  }

  @Post(':id/settlement-account')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Assign primary settlement account' })
  async assignSettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSettlementAccountDto,
  ) {
    return this.commandBus.execute(
      new AssignSettlementAccountCommand(toActor(user), id, dto),
    );
  }

  @Post(':id/verify-settlement')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Verify settlement account via CBS' })
  async verifySettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new VerifySettlementCommand(toActor(user), id));
  }

  @Get(':id/fee-schedule')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({
    summary: 'Resolve the fee schedule this application\'s merchant would be billed under (brief §4.3, Step 7)',
  })
  async getFeeSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queryBus.execute(new GetApplicationFeeScheduleQuery(toActor(user), id));
  }

  @Post(':id/accept-fee-schedule')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Record acceptance of the resolved fee schedule (brief §4.3, Step 7)' })
  async acceptFeeSchedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new AcceptFeeScheduleCommand(toActor(user), id));
  }

  @Post(':id/aml-screen')
  @RequirePermissions(Permission.ONBOARDING_AML_TRIGGER)
  @ApiOperation({ summary: 'Trigger AML screening' })
  async amlScreen(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new AmlScreenOnboardingCommand(toActor(user), id));
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.ONBOARDING_SUBMIT)
  @ApiOperation({ summary: 'Submit application for approval' })
  async submit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new SubmitOnboardingCommand(toActor(user), id));
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.ONBOARDING_APPROVE)
  @ApiOperation({ summary: 'Maker approve — creates checker task' })
  async makerApprove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new MakerApproveOnboardingCommand(toActor(user), id));
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  @ApiOperation({ summary: 'Reject application' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOnboardingDto,
  ) {
    return this.commandBus.execute(
      new RejectOnboardingCommand(toActor(user), id, dto.rejectionCode, dto.notes),
    );
  }

  @Post(':id/resubmit')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  @ApiOperation({ summary: 'Resubmit rejected application' })
  async resubmit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(new ResubmitOnboardingCommand(toActor(user), id));
  }

  @Get(':id/timeline')
  @RequirePermissions(Permission.ONBOARDING_READ)
  @ApiOperation({ summary: 'Onboarding status timeline' })
  async timeline(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queryBus.execute(new GetOnboardingTimelineQuery(toActor(user), id));
  }
}
