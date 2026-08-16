import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { StudentRegistryService } from '../../application/services/student-registry.service';
import {
  EnrollStudentDto,
  UpdateStudentRegistryDto,
} from '../dto/school-fee.dto';

const toActor = (u: JwtPayload): ActorContext => ({
  sub: u.sub,
  email: u.email,
  acquirerId: u.acquirerId,
  merchantId: u.merchantId,
  roles: u.roles,
  permissions: u.permissions,
});

@ApiTags('School Student Registry')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId/registry')
export class StudentRegistryController {
  constructor(
    private readonly registry: StudentRegistryService,
    private readonly access: SchoolAccessService,
  ) {}

  @Get('students')
  @RequirePermissions(Permission.SCHOOL_STUDENT_READ)
  @ApiOperation({ summary: 'List students with enrollments (M4 registry)' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query('status') status?: StudentStatus,
    @Query('classLevelId') classLevelId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('search') search?: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.list(merchantId, {
      status,
      classLevelId,
      academicYearId,
      search,
    });
  }

  @Get('students/:studentId')
  @RequirePermissions(Permission.SCHOOL_STUDENT_READ)
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.getStudent(merchantId, studentId);
  }

  @Patch('students/:studentId')
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpdateStudentRegistryDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.updateStudent(merchantId, studentId, dto);
  }

  @Post('students/:studentId/enroll')
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  async enroll(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: EnrollStudentDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.enrollStudent(
      merchantId,
      studentId,
      dto.academicYearId,
      dto.classLevelId,
    );
  }

  @Post('students/:studentId/promote')
  @RequirePermissions(Permission.SCHOOL_STUDENT_WRITE)
  async promote(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: EnrollStudentDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.promoteStudent(
      merchantId,
      studentId,
      dto.academicYearId,
      dto.classLevelId,
    );
  }

  @Post('students/bulk-import')
  @RequirePermissions(Permission.SCHOOL_STUDENT_BULK)
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImport(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @UploadedFile() file?: { buffer: Buffer },
    @Body() body?: { csv?: string },
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.registry.bulkImportWithErrors(
      merchantId,
      file,
      body?.csv,
      user.sub,
    );
  }
}
