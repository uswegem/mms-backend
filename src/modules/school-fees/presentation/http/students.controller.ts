import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { MerchantScopeService } from '@shared/application/services/merchant-scope.service';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { StudentAliasService } from '../../application/services/student-alias.service';
import { BulkStudentUploadService } from '../../application/services/bulk-student-upload.service';
import { PosterRenderer } from '@shared/qr-poster/poster.renderer';
import {
  BulkConfirmDto,
  CreateStudentDto,
  SendQrDto,
} from '../dto/student.dto';

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

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId/students')
export class StudentsController {
  constructor(
    private readonly students: StudentAliasService,
    private readonly bulkUpload: BulkStudentUploadService,
    private readonly poster: PosterRenderer,
    private readonly scope: MerchantScopeService,
  ) {}

  // ── List ──────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions(Permission.SCHOOL_STUDENT_READ)
  @ApiOperation({ summary: 'List school students with Lipa Namba aliases' })
  list(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    return this.students.listStudents(merchantId);
  }

  // ── Single enrol ──────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  @ApiOperation({
    summary: 'Enrol single student — permanent Lipa Namba + static TANQR',
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: CreateStudentDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    return this.students.createStudent(
      merchantId,
      {
        admissionNo: dto.admissionNo,
        fullName: dto.fullName,
        guardianPhone: dto.guardianPhone,
        parentEmail: dto.parentEmail,
        idempotencyKey: idempotencyKeyHeader ?? dto.idempotency_key,
      },
      user.sub,
    );
  }

  // ── CSV preview (parse + validate, NO DB write) ───────────────────────────

  @Post('bulk/preview')
  @RequirePermissions(Permission.SCHOOL_STUDENT_BULK)
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Parse and validate a bulk CSV — returns per-row preview with errors. No DB write.',
  })
  @UseInterceptors(FileInterceptor('file'))
  async bulkPreview(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: { buffer: Buffer },
    @Body() body?: { csv?: string },
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    const rows = this.bulkUpload.parseInput(file, body?.csv);
    const withDupes = this.bulkUpload.flagFileDuplicates(rows);
    const valid = withDupes.filter((r) => r.valid).length;
    const invalid = withDupes.filter((r) => !r.valid).length;
    return { total: withDupes.length, valid, invalid, rows: withDupes };
  }

  // ── CSV confirm (create students + queue alias generation) ────────────────

  @Post('bulk')
  @RequirePermissions(Permission.SCHOOL_STUDENT_BULK)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary:
      'Confirm bulk import — creates Student records and queues async alias generation.',
  })
  async bulkConfirm(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: BulkConfirmDto,
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    return this.students.confirmBulkImport(
      merchantId,
      dto.rows,
      user.sub,
      dto.parentalConsentAttested,
    );
  }

  // ── Send QR to parent ─────────────────────────────────────────────────────

  @Post(':studentId/send-qr')
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue QR poster delivery to parent via email and/or SMS',
  })
  async sendQr(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SendQrDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    return this.students.sendQrToParent(studentId, dto.channels);
  }

  // ── Download PDF poster for single student ────────────────────────────────

  @Get(':studentId/qr-poster.pdf')
  @RequirePermissions(Permission.SCHOOL_STUDENT_READ)
  @ApiOperation({ summary: 'Download single-student QR poster as PDF' })
  async downloadPdf(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    this.scope.assertCanAccessMerchant(toActor(user), merchantId);
    const student = await this.students.getStudentWithQr(studentId);

    const tlvPayload =
      student.studentAlias?.qrCode?.payloadVersions[0]?.tlvPayload ?? '';

    const pdf = await this.poster.renderPdf({
      name: student.fullName,
      alias: student.studentAlias?.alias10digit ?? '',
      tlvPayload,
      schoolName: student.merchant.tradingName,
      isActive: student.status === 'ACTIVE',
      statusLabel: student.status,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="LipaNamba_${student.fullName.replace(/\s+/g, '_')}.pdf"`,
    );
    res.send(pdf);
  }
}
