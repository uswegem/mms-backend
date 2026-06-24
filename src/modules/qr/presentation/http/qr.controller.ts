import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { QrRepository } from '../../infrastructure/persistence/qr.repository';
import { CreateStaticQrDto } from '../dto/qr.dto';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { MerchantAliasService } from '@modules/alias/application/services/merchant-alias.service';

@ApiTags('QR')
@ApiBearerAuth('access-token')
@Controller('qr')
export class QrController {
  constructor(
    private readonly qr: QrRepository,
    private readonly prisma: PrismaService,
    private readonly aliases: MerchantAliasService,
  ) {}

  @Get('merchant/:merchantId')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'List merchant QR codes' })
  listByMerchant(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.qr.listByMerchant(merchantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'Get QR code with latest payload' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.qr.findById(id);
  }

  @Post('static')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Generate static TANQR for merchant' })
  async createStatic(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaticQrDto,
  ) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: dto.merchantId },
      include: { profile: true, merchantAlias: true },
    });

    const alias =
      merchant.merchantAlias ??
      (await this.aliases.getMerchantAlias(dto.merchantId).catch(() => null));

    if (!alias) {
      throw new BadRequestException('Merchant alias required before QR generation');
    }

    return this.qr.createStaticQr({
      merchantId: dto.merchantId,
      studentId: dto.studentId,
      merchantName: merchant.tradingName,
      city: merchant.profile?.city ?? 'Dar es Salaam',
      postalCode: merchant.profile?.postalCode ?? '11000',
      mcc: merchant.mcc,
      publicAlias: alias.alias8digit,
      internalRoutingId: dto.internalRoutingId,
      createdBy: user.sub,
    });
  }
}
