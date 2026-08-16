import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ExceptionCaseStatus, ExceptionResolutionAction, ExceptionSeverity } from '@prisma/client';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { ExceptionCaseService } from '../../application/services/exception-case.service';
import { ExceptionResolutionService } from '../../application/services/exception-resolution.service';
import { ReconciliationService } from '../../application/services/reconciliation.service';
import { ReconSimFeedService } from '../../application/services/recon-sim-feed.service';
import { SettlementIngestionService } from '../../application/services/settlement-ingestion.service';
import {
  ExceptionListQueryDto,
  ExceptionResolveDto,
  ReconListQueryDto,
  ReconSchoolSummaryQueryDto,
  SimFeedDto,
  StartReconciliationDto,
} from '../dto/recon.dto';

@ApiTags('School Reconciliation')
@ApiBearerAuth('access-token')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly ingestion: SettlementIngestionService,
    private readonly simulator: ReconSimFeedService,
    private readonly exceptions: ExceptionCaseService,
    private readonly resolution: ExceptionResolutionService,
    private readonly access: SchoolAccessService,
  ) {}

  @Post('ingest')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(Permission.SCHOOL_RECON_INGEST)
  ingest(@CurrentUser() user: JwtPayload, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('CSV file is required');
    return this.ingestion.ingestCsv(file.originalname, file.buffer, user.sub);
  }

  @Get('batches')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  listBatches() {
    return this.ingestion.listBatches();
  }

  @Post('runs')
  @RequirePermissions(Permission.SCHOOL_RECON_RUN)
  startRun(@CurrentUser() user: JwtPayload, @Body() body: StartReconciliationDto) {
    return this.reconciliation.startRun({
      ...body,
      dateFrom: new Date(body.dateFrom),
      dateTo: new Date(body.dateTo),
      actorId: user.sub,
    });
  }

  @Get('runs')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  listRuns(@Query() query: ReconListQueryDto) {
    return this.reconciliation.listRuns(query.source);
  }

  @Get('runs/:id')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.runDetail(id);
  }

  @Get('schools/:merchantId/summary')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  schoolSummary(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: ReconSchoolSummaryQueryDto,
  ) {
    return this.reconciliation.schoolSummary(
      merchantId,
      new Date(query.dateFrom),
      new Date(query.dateTo),
    );
  }

  @Post('sim-feed')
  @RequirePermissions(Permission.SCHOOL_RECON_RUN)
  simulate(@Body() body: SimFeedDto) {
    return this.simulator.generateFromMmsPayments({
      ...body,
      dateFrom: body.dateFrom ? new Date(body.dateFrom) : undefined,
      dateTo: body.dateTo ? new Date(body.dateTo) : undefined,
    });
  }

  @Get('exceptions')
  @RequirePermissions(Permission.SCHOOL_RECON_EXCEPTION_READ)
  listExceptions(@Query() query: ExceptionListQueryDto) {
    return this.exceptions.list({
      status: query.status,
      merchantId: query.merchantId,
      severity: query.severity,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('exceptions/:id')
  @RequirePermissions(Permission.SCHOOL_RECON_EXCEPTION_READ)
  exceptionDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.exceptions.detail(id, false);
  }

  @Post('exceptions/:id/resolve')
  @RequirePermissions(Permission.SCHOOL_RECON_EXCEPTION_RESOLVE)
  resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExceptionResolveDto,
  ) {
    return this.resolution.propose({
      caseId: id,
      action: body.action,
      actorId: user.sub,
      acquirerId: user.acquirerId,
      note: body.note,
      payload: body.payload,
    });
  }

  @Get('schools/:merchantId/exceptions')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  async schoolExceptions(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: ExceptionListQueryDto,
  ) {
    await this.access.assertActorCanAccessSchool(
      {
        sub: user.sub,
        email: user.email,
        acquirerId: user.acquirerId,
        merchantId: user.merchantId,
        roles: user.roles,
        permissions: user.permissions,
      },
      merchantId,
    );
    return this.exceptions.list({
      merchantId,
      status: query.status,
      severity: query.severity,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('schools/:merchantId/exceptions/:id')
  @RequirePermissions(Permission.SCHOOL_RECON_READ)
  async schoolExceptionDetail(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(
      {
        sub: user.sub,
        email: user.email,
        acquirerId: user.acquirerId,
        merchantId: user.merchantId,
        roles: user.roles,
        permissions: user.permissions,
      },
      merchantId,
    );
    const detail = await this.exceptions.detail(id, true);
    if (detail.merchantId && detail.merchantId !== merchantId) {
      throw new BadRequestException('Exception does not belong to this school');
    }
    return detail;
  }
}
