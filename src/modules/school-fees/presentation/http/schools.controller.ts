import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegalEntityType } from '@prisma/client';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { CommandBus } from '@nestjs/cqrs';
import { CreateOnboardingApplicationCommand } from '@modules/merchant-onboarding/application/commands/create-onboarding-application.command';
import { SchoolsRepository } from '../../infrastructure/persistence/schools.repository';
import {
  CreateSchoolOnboardingDto,
  UpdateSchoolContactsDto,
  UpdateSchoolProfileDto,
} from '../dto/school.dto';

@ApiTags('Schools')
@ApiBearerAuth('access-token')
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsRepository,
    private readonly commandBus: CommandBus,
  ) {}

  @Post('onboarding')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.SCHOOL_ONBOARDING)
  @ApiOperation({ summary: 'Start school onboarding application' })
  async createSchoolOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSchoolOnboardingDto,
  ) {
    const actor = {
      sub: user.sub,
      email: user.email,
      acquirerId: user.acquirerId,
      merchantId: user.merchantId,
      roles: user.roles,
      permissions: user.permissions,
    };
    const app = await this.commandBus.execute(
      new CreateOnboardingApplicationCommand(actor, {
        legalEntityType: LegalEntityType.COMPANY,
        legalName: dto.legalName,
        tradingName: dto.tradingName,
        mcc: dto.mcc ?? '8211',
        city: dto.city,
        postalCode: dto.postalCode,
        taxId: dto.taxId,
        isSchool: true,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
      }),
    );
    if (dto.registrationNo || dto.headName) {
      await this.schools.updateProfile(app.merchantId, {
        registrationNo: dto.registrationNo,
        headName: dto.headName,
      });
    }
    return app;
  }

  @Get(':merchantId')
  @RequirePermissions(Permission.SCHOOL_READ)
  @ApiOperation({ summary: 'Get school profile by merchant ID' })
  async getSchool(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    const school = await this.schools.findByMerchantId(merchantId);
    if (!school) return { merchantId, profile: null };
    return {
      merchantId: school.merchantId,
      registrationNo: school.registrationNo,
      headName: school.headName,
      address: school.address,
      contactPhone: school.contactPhone,
      contactEmail: school.contactEmail,
      bursarName: school.bursarName,
      bursarPhone: school.bursarPhone,
      merchant: {
        legalName: school.merchant.legalName,
        tradingName: school.merchant.tradingName,
        status: school.merchant.status,
        profile: school.merchant.profile,
      },
    };
  }

  @Put(':merchantId/profile')
  @RequirePermissions(Permission.SCHOOL_WRITE)
  @ApiOperation({ summary: 'Update school profile' })
  async updateProfile(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: UpdateSchoolProfileDto,
  ) {
    const school = await this.schools.updateProfile(merchantId, dto);
    return {
      merchantId: school.merchantId,
      registrationNo: school.registrationNo,
      headName: school.headName,
      address: school.address,
    };
  }

  @Put(':merchantId/contacts')
  @RequirePermissions(Permission.SCHOOL_WRITE)
  @ApiOperation({ summary: 'Update school contact management' })
  async updateContacts(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: UpdateSchoolContactsDto,
  ) {
    const school = await this.schools.updateContacts(merchantId, dto);
    return {
      merchantId: school.merchantId,
      contactPhone: school.contactPhone,
      contactEmail: school.contactEmail,
      bursarName: school.bursarName,
      bursarPhone: school.bursarPhone,
    };
  }
}
