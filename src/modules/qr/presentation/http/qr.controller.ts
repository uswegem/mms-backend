import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { QrService } from '../../application/services/qr.service';
import { QrRepository } from '../../infrastructure/persistence/qr.repository';
import { CreateStaticQrDto } from '../dto/create-static-qr.dto';
import { LegacyCreateStaticQrDto } from '../dto/legacy-qr.dto';

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

/** Legacy QR routes — prefer `POST /merchants/:merchantId/qr/*`. */
@ApiTags('QR')
@ApiBearerAuth('access-token')
@Controller('qr')
export class QrController {
  constructor(
    private readonly qrService: QrService,
    private readonly qrRepository: QrRepository,
  ) {}

  @Get('merchant/:merchantId')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'List merchant QR codes' })
  listByMerchant(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.listMerchantQrs(merchantId, toActor(user));
  }

  @Get(':id/download')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Download QR asset (redirect to storage)' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const qr = await this.qrRepository.findById(id);
    if (!qr?.payloadVersions[0]) {
      return res.status(404).json({ detail: 'QR not found' });
    }
    const version = qr.payloadVersions[0].version;
    const assets = await this.qrRepository.getAssetUrls(id, version);
    const fmt = (format ?? 'png').toLowerCase();
    const url = assets[fmt as keyof typeof assets];
    if (!url) {
      return res.status(404).json({ detail: `Format ${fmt} not available` });
    }
    return res.redirect(url);
  }

  @Post(':id/regenerate')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Regenerate static QR (new payload version)' })
  regenerate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.regenerateQr(id, toActor(user));
  }

  @Patch(':id/disable')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Disable / revoke QR code' })
  disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.disableQr(id, toActor(user));
  }

  @Get(':id')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Get QR code with latest payload' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrRepository.findById(id);
  }

  @Post('static')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Generate static TANQR (legacy body with merchantId)' })
  createStaticLegacy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LegacyCreateStaticQrDto,
  ) {
    return this.qrService.generateStatic(dto.merchantId, toActor(user), {
      forceRegenerate: dto.force_regenerate,
      internalRoutingId: dto.internalRoutingId,
      studentId: dto.studentId,
    });
  }
}
