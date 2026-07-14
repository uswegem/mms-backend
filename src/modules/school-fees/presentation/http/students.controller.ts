import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { StudentAliasService } from '../../application/services/student-alias.service';
import { BulkStudentUploadService } from '../../application/services/bulk-student-upload.service';
import { CreateStudentDto } from '../dto/student.dto';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId/students')
export class StudentsController {
  constructor(
    private readonly students: StudentAliasService,
    private readonly bulkUpload: BulkStudentUploadService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SCHOOL_STUDENT_READ)
  @ApiOperation({ summary: 'List school students with Lipa Namba aliases' })
  list(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.students.listStudents(merchantId);
  }

  @Post()
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  @ApiOperation({ summary: 'Enrol single student — permanent Lipa Namba + static TANQR' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: CreateStudentDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    return this.students.createStudent(
      merchantId,
      {
        admissionNo: dto.admissionNo,
        fullName: dto.fullName,
        guardianPhone: dto.guardianPhone,
        idempotencyKey: idempotencyKeyHeader ?? dto.idempotency_key,
      },
      user.sub,
    );
  }

  @Post('bulk')
  @RequirePermissions(Permission.SCHOOL_STUDENT_BULK)
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Bulk student CSV upload — alias generation or reactivation' })
  @UseInterceptors(FileInterceptor('file'))
  async bulk(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @UploadedFile() file?: { buffer: Buffer },
    @Body() body?: { csv?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const rows = await this.bulkUpload.parseInput(file, body?.csv);
    return this.students.bulkUpload(
      merchantId,
      rows,
      user.sub,
      idempotencyKeyHeader ?? body?.idempotency_key,
    );
  }
}
