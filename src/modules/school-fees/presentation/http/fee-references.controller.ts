import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { ReferenceAdminService } from '../../application/services/reference-admin.service';
import {
  ReferenceErrorCode,
  ReferenceResolutionException,
} from '../../domain/reference-resolution.exception';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReferenceResolutionService } from '../../application/services/reference-resolution.service';

const toActor = (u: JwtPayload): ActorContext => ({
  sub: u.sub,
  email: u.email,
  acquirerId: u.acquirerId,
  merchantId: u.merchantId,
  roles: u.roles,
  permissions: u.permissions,
});

@ApiTags('School Fee References')
@Controller()
export class FeeReferencesController {
  constructor(
    private readonly resolution: ReferenceResolutionService,
    private readonly admin: ReferenceAdminService,
    private readonly access: SchoolAccessService,
  ) {}

  /** Channel / payer-facing lookup — public, payer-safe fields only. */
  @Public()
  @Get('channel/fee-references/:reference')
  @ApiOperation({
    summary: 'Public payer lookup by control number or student Lipa Namba',
  })
  async channelLookup(@Param('reference') reference: string) {
    try {
      const resolved = await this.resolution.resolve(reference, {
        channel: 'CHANNEL',
      });
      return this.resolution.toPayerFacing(resolved);
    } catch (err) {
      if (err instanceof ReferenceResolutionException) {
        if (err.code === ReferenceErrorCode.NOT_FOUND) {
          throw new NotFoundException({ code: err.code, message: err.message });
        }
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  @Get('schools/:merchantId/fee-references/search')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async schoolSearch(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query('q') q: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.admin.search({ merchantId, q: q ?? '' });
  }

  @Get('schools/:merchantId/fee-references/:reference/trail')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  async schoolTrail(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('reference') reference: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    return this.admin.trail(merchantId, reference);
  }

  @Get('schools/:merchantId/fee-invoices/:invoiceId/payment-slip.pdf')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.SCHOOL_INVOICE_READ)
  @Header('Content-Type', 'application/pdf')
  async paymentSlip(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), merchantId);
    const pdf = await this.admin.renderPaymentSlipPdf(merchantId, invoiceId);
    res.set({
      'Content-Disposition': `attachment; filename="payment-slip-${invoiceId}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  /** Platform support — global read-only reference search. */
  @Get('admin/fee-references/search')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  platformSearch(@Query('q') q: string) {
    return this.admin.search({ q: q ?? '' });
  }

  @Get('admin/fee-references/:reference/trail')
  @ApiBearerAuth('access-token')
  @RequirePermissions(Permission.SCHOOL_PAYMENT_READ)
  platformTrail(@Param('reference') reference: string) {
    return this.admin.trail(undefined, reference);
  }
}
