import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { InvoiceService } from '../../application/services/invoice.service';
import { SchoolAccessService } from '../../application/services/school-access.service';
import {
  AdjustmentDto,
  CancelInvoiceDto,
  GenerateClassInvoicesDto,
  GenerateInvoiceDto,
} from '../dto/school-fee.dto';

const toActor = (u: JwtPayload): ActorContext => ({
  sub: u.sub,
  email: u.email,
  acquirerId: u.acquirerId,
  merchantId: u.merchantId,
  roles: u.roles,
  permissions: u.permissions,
});

@ApiTags('School Fee Invoices')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId/fee-invoices')
export class FeeInvoicesController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly access: SchoolAccessService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SCHOOL_INVOICE_READ)
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Query('classLevelId') classLevelId?: string,
    @Query('academicTermId') academicTermId?: string,
    @Query('status') status?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED',
    @Query('search') search?: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.list(m, { classLevelId, academicTermId, status, search });
  }

  @Get('totals/:classLevelId/:termId')
  @RequirePermissions(Permission.SCHOOL_INVOICE_READ)
  async totals(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('classLevelId', ParseUUIDPipe) c: string,
    @Param('termId', ParseUUIDPipe) t: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.classTermTotals(m, c, t);
  }

  @Get('students/:studentId/statement')
  @RequirePermissions(Permission.SCHOOL_INVOICE_READ)
  async statement(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('studentId', ParseUUIDPipe) s: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.studentStatement(m, s);
  }

  @Get(':id')
  @RequirePermissions(Permission.SCHOOL_INVOICE_READ)
  async detail(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.detail(m, id);
  }

  @Post('generate')
  @RequirePermissions(Permission.SCHOOL_INVOICE_WRITE)
  async generate(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: GenerateInvoiceDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.generateForStudent(
      m,
      d.studentId,
      d.academicTermId,
      user.sub,
      toActor(user),
    );
  }

  @Post('generate-class')
  @RequirePermissions(Permission.SCHOOL_INVOICE_WRITE)
  async generateClass(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: GenerateClassInvoicesDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.generateForClass(
      m,
      d.classLevelId,
      d.academicTermId,
      user.sub,
      toActor(user),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.SCHOOL_INVOICE_CANCEL)
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CancelInvoiceDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.cancel(m, id, d.reason, user.sub);
  }

  @Post(':id/adjustments')
  @RequirePermissions(Permission.SCHOOL_INVOICE_WAIVE)
  async adjust(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AdjustmentDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.invoices.applyAdjustment(m, id, d, user.sub);
  }
}
