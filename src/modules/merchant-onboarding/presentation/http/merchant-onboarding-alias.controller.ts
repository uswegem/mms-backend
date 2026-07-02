import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { SubmitOnboardingCommand } from '../../application/commands/submit-onboarding.command';
import { RejectOnboardingCommand } from '../../application/commands/reject-onboarding.command';
import { ResubmitOnboardingCommand } from '../../application/commands/resubmit-onboarding.command';
import { ListOnboardingApplicationsQuery } from '../../application/queries/list-onboarding-applications.query';
import { GetOnboardingApplicationQuery } from '../../application/queries/get-onboarding-application.query';
import { GetOnboardingTimelineQuery } from '../../application/queries/get-onboarding-timeline.query';
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
} from '../../application/commands/onboarding-pipeline.commands';
import {
  CreateOnboardingApplicationDto,
  ListOnboardingQueryDto,
  RejectOnboardingDto,
  UpdateOnboardingApplicationDto,
} from '../dto/onboarding.dto';
import {
  BulkStoreUploadDto,
  KycDecisionDto,
  RiskDecisionDto,
  SettlementConfigDto,
} from '../dto/onboarding-pipeline.dto';

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

/** Alias routes matching client-approved API contract (`/merchant-onboarding/*`). */
@ApiTags('Merchant Onboarding')
@ApiBearerAuth('access-token')
@Controller('merchant-onboarding')
export class MerchantOnboardingAliasController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @RequirePermissions(Permission.ONBOARDING_READ)
  list(@CurrentUser() user: JwtPayload, @Query() query: ListOnboardingQueryDto) {
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

  @Get('dashboard')
  @RequirePermissions(Permission.ONBOARDING_READ)
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.queryBus.execute(new GetOnboardingDashboardQuery(toActor(user)));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOnboardingApplicationDto) {
    return this.commandBus.execute(
      new CreateOnboardingApplicationCommand(toActor(user), dto),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.ONBOARDING_READ)
  getOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetOnboardingApplicationQuery(toActor(user), id));
  }

  @Patch(':id/profile')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOnboardingApplicationDto,
  ) {
    return this.commandBus.execute(
      new UpdateOnboardingApplicationCommand(toActor(user), id, dto),
    );
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.ONBOARDING_SUBMIT)
  submit(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(new SubmitOnboardingCommand(toActor(user), id));
  }

  @Delete(':id/kyc/documents/:documentId')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  deleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.commandBus.execute(
      new DeleteOnboardingDocumentCommand(toActor(user), id, documentId),
    );
  }

  @Post(':id/kyc/approve')
  @RequirePermissions(Permission.ONBOARDING_APPROVE)
  kycApprove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(new KycDecisionCommand(toActor(user), id, dto.remarks));
  }

  @Post(':id/kyc/reject')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  kycReject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(
      new KycRejectPipelineCommand(toActor(user), id, dto.rejectionCode ?? 'INCOMPLETE_KYC', dto.remarks),
    );
  }

  @Post(':id/kyc/send-back')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  kycSendBack(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(new KycSendBackCommand(toActor(user), id, dto.remarks));
  }

  @Post(':id/send-back')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  sendBack(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(new KycSendBackCommand(toActor(user), id, dto.remarks));
  }

  @Post(':id/risk/approve')
  @RequirePermissions(Permission.ONBOARDING_APPROVE)
  riskApprove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RiskDecisionDto,
  ) {
    return this.commandBus.execute(new RiskDecisionCommand(toActor(user), id, dto));
  }

  @Post(':id/risk/reject')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  riskReject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RiskDecisionDto,
  ) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'risk_reject', dto.remarks),
    );
  }

  @Post(':id/bank/validate')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  bankValidate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'bank_validate'),
    );
  }

  @Post(':id/tps/register')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  tpsRegister(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'tps_register'),
    );
  }

  @Post(':id/tps/retry')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  tpsRetry(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'tps_retry'),
    );
  }

  @Post(':id/store/bulk-upload')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  bulkStores(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkStoreUploadDto,
  ) {
    return this.commandBus.execute(
      new BulkStoreUploadCommand(toActor(user), id, dto.stores),
    );
  }

  @Post(':id/alias-qr/register')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  aliasQrRegister(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'alias_qr_register'),
    );
  }

  @Post(':id/alias-qr/retry')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  aliasQrRetry(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'alias_qr_retry'),
    );
  }

  @Post(':id/settlement')
  @RequirePermissions(Permission.ONBOARDING_WRITE)
  settlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettlementConfigDto,
  ) {
    return this.commandBus.execute(new SettlementConfigCommand(toActor(user), id, dto));
  }

  @Post(':id/settlement/approve')
  @RequirePermissions(Permission.ONBOARDING_APPROVE)
  settlementApprove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'settlement_approve', dto.remarks),
    );
  }

  @Post(':id/settlement/reject')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  settlementReject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.commandBus.execute(
      new PipelineActionCommand(toActor(user), id, 'settlement_reject', dto.remarks),
    );
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.ONBOARDING_APPROVE)
  activate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(new ActivateOnboardingCommand(toActor(user), id));
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.ONBOARDING_REJECT)
  reject(
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
  resubmit(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.commandBus.execute(new ResubmitOnboardingCommand(toActor(user), id));
  }

  @Get(':id/audit-logs')
  @RequirePermissions(Permission.ONBOARDING_READ)
  auditLogs(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetOnboardingAuditLogsQuery(toActor(user), id));
  }

  @Get(':id/timeline')
  @RequirePermissions(Permission.ONBOARDING_READ)
  timeline(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetOnboardingTimelineQuery(toActor(user), id));
  }
}
