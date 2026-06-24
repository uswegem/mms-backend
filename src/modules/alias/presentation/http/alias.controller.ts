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
import { Public } from '@infrastructure/auth/rbac/decorators/public.decorator';
import { MerchantAliasService } from '../../application/services/merchant-alias.service';
import { ValidateAliasDto } from '../dto/alias.dto';

@ApiTags('Alias')
@ApiBearerAuth('access-token')
@Controller()
export class AliasController {
  constructor(private readonly aliases: MerchantAliasService) {}

  @Get('merchants/:merchantId/alias')
  @RequirePermissions(Permission.ALIAS_READ)
  @ApiOperation({ summary: 'Get school/merchant Lipa Namba alias' })
  getMerchantAlias(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.aliases.getMerchantAlias(merchantId);
  }

  @Post('alias/validate')
  @Public()
  @ApiOperation({ summary: 'Validate 8-digit Lipa Namba checksum' })
  validate(@Body() dto: ValidateAliasDto) {
    return this.aliases.validateAlias(dto.alias8digit);
  }

  @Get('alias/lookup/:alias')
  @RequirePermissions(Permission.ALIAS_LOOKUP)
  @ApiOperation({ summary: 'Lookup alias owner (merchant or student)' })
  lookup(@Param('alias') alias: string) {
    return this.aliases.lookupAlias(alias);
  }
}
