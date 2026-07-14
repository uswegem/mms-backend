import {
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
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { QrService } from '../../application/services/qr.service';
import { QrRepository } from '../../infrastructure/persistence/qr.repository';
import { CreateDynamicQrDto } from '../dto/create-dynamic-qr.dto';
import { CreateStaticQrDto } from '../dto/create-static-qr.dto';

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

@ApiTags('Merchant QR')
@ApiBearerAuth('access-token')
@Controller('merchants/:merchantId/qr')
export class MerchantQrController {
  constructor(
    private readonly qrService: QrService,
    private readonly qrRepository: QrRepository,
  ) {}

  @Post('static')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Generate static TANQR for merchant' })
  createStatic(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaticQrDto,
  ) {
    return this.qrService.generateStatic(merchantId, toActor(user), {
      storeId: dto.store_id,
      terminalId: dto.terminal_id,
      purpose: dto.purpose,
      forceRegenerate: dto.force_regenerate ?? false,
      amount: dto.amount,
    });
  }

  @Post('dynamic')
  @RequirePermissions(Permission.QR_GENERATE)
  @ApiOperation({ summary: 'Generate dynamic TANQR for merchant' })
  createDynamic(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDynamicQrDto,
  ) {
    return this.qrService.generateDynamic(merchantId, toActor(user), {
      amount: dto.amount,
      billNumber: dto.bill_number,
      referenceLabel: dto.reference_label,
      storeId: dto.store_id,
      terminalId: dto.terminal_id,
      expiresInMinutes: dto.expires_in_minutes,
    });
  }

  @Get()
  @RequirePermissions(Permission.QR_READ)
  @ApiOperation({ summary: 'List merchant QR codes' })
  list(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qrService.listMerchantQrs(merchantId, toActor(user));
  }
}
