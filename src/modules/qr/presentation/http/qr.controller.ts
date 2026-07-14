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
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { QrService } from '../../application/services/qr.service';
import { QrRepository } from '../../infrastructure/persistence/qr.repository';
import { CreateStaticQrDto } from '../dto/create-static-qr.dto';
import {
  LegacyCreateDynamicQrDto,
  LegacyCreateStaticQrDto,
} from '../dto/legacy-qr.dto';
import { ValidateQrPayloadDto } from '../dto/validate-qr-payload.dto';

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

  @Post('validate')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Validate or build-and-verify a TANQR payload' })
  validatePayload(@Body() dto: ValidateQrPayloadDto) {
    return this.qrService.validatePayload(dto);
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
      amount: dto.amount,
    });
  }

  @Post('dynamic')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Generate dynamic TANQR (legacy body with merchantId)' })
  createDynamicLegacy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LegacyCreateDynamicQrDto,
  ) {
    return this.qrService.generateDynamic(dto.merchantId, toActor(user), {
      amount: dto.amount,
      billNumber: dto.bill_number,
      referenceLabel: dto.reference_label,
      storeId: dto.store_id,
      terminalId: dto.terminal_id,
      expiresInMinutes: dto.expires_in_minutes,
    });
  }

  @Get('merchant/:merchantId')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'List merchant QR codes' })
  listByMerchant(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.listMerchantQrs(merchantId, toActor(user));
  }

  @Get(':id/image.png')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Download QR matrix as PNG (locally generated)' })
  @ApiProduces('image/png')
  async imagePng(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer } = await this.qrService.getQrImageBuffer(id, toActor(user), 'png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${id}.png"`);
    return res.send(buffer);
  }

  @Get(':id/image.svg')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Download QR matrix as SVG (locally generated)' })
  @ApiProduces('image/svg+xml')
  async imageSvg(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer } = await this.qrService.getQrImageBuffer(id, toActor(user), 'svg');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `inline; filename="qr-${id}.svg"`);
    return res.send(buffer);
  }

  @Get(':id/display.pdf')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Download TANQR Annex 2 merchant display as PDF' })
  @ApiProduces('application/pdf')
  async displayPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('paper_size') paperSize: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const buffer = await this.qrService.getDisplayPdf(id, toActor(user), paperSize);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="qr-display-${id}.pdf"`);
    return res.send(buffer);
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

  @Patch(':id/acknowledge-reprint')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({
    summary:
      'Clear the reprint-required flag once the new sticker has replaced a stale one in the field',
  })
  acknowledgeReprint(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.acknowledgeReprint(id, toActor(user));
  }

  @Get(':id')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Get QR code with latest payload' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrRepository.findById(id);
  }
}
