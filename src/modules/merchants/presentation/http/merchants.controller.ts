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
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ListMerchantsQuery } from '../../application/queries/list-merchants.query';
import { GetMerchantQuery } from '../../application/queries/get-merchant.query';
import { ListMerchantDocumentsQuery } from '../../application/queries/list-merchant-documents.query';
import { ListKycReviewsQuery } from '../../application/queries/list-kyc-reviews.query';
import { CreateMerchantCommand } from '../../application/commands/create-merchant.command';
import { UpdateMerchantCommand } from '../../application/commands/update-merchant.command';
import { SuspendMerchantCommand } from '../../application/commands/suspend-merchant.command';
import { ActivateMerchantCommand } from '../../application/commands/activate-merchant.command';
import { DormantMerchantCommand } from '../../application/commands/dormant-merchant.command';
import { AddKycDocumentCommand } from '../../application/commands/add-kyc-document.command';
import { SubmitKycCommand } from '../../application/commands/submit-kyc.command';
import { ReviewKycCommand } from '../../application/commands/review-kyc.command';
import {
  AddKycDocumentDto,
  CreateMerchantDto,
  ListMerchantsQueryDto,
  MerchantDocumentDto,
  MerchantKycReviewDto,
  MerchantResponseDto,
  PaginatedMerchantsResponseDto,
  ReviewKycDto,
  UpdateMerchantDto,
} from '../dto/merchant.dto';

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

@ApiTags('Merchants')
@ApiBearerAuth('access-token')
@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @RequirePermissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: 'List and search merchants' })
  @ApiResponse({ status: 200, type: PaginatedMerchantsResponseDto })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMerchantsQueryDto,
  ): Promise<PaginatedMerchantsResponseDto> {
    return this.queryBus.execute(
      new ListMerchantsQuery(
        toActor(user),
        query.page ?? 1,
        query.limit ?? 20,
        query.status,
        query.q,
      ),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MERCHANT_WRITE)
  @ApiOperation({ summary: 'Create merchant' })
  @ApiResponse({ status: 201, type: MerchantResponseDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMerchantDto,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new CreateMerchantCommand(
        toActor(user),
        dto.legalName,
        dto.tradingName,
        dto.mcc,
        dto.postalCode,
        dto.taxId,
        dto.isSchool,
        dto.region,
        dto.district,
        dto.ward,
        dto.city,
        dto.addressLine1,
        dto.addressLine2,
        dto.contactPhone,
        dto.contactEmail,
      ),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: 'Get merchant by ID' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.queryBus.execute(new GetMerchantQuery(toActor(user), id));
  }

  @Put(':id')
  @RequirePermissions(Permission.MERCHANT_WRITE)
  @ApiOperation({ summary: 'Update merchant' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new UpdateMerchantCommand(
        toActor(user),
        id,
        dto.tradingName,
        dto.mcc,
        dto.taxId,
        dto.region,
        dto.district,
        dto.ward,
        dto.city,
        dto.postalCode,
        dto.addressLine1,
        dto.addressLine2,
        dto.contactPhone,
        dto.contactEmail,
      ),
    );
  }

  @Post(':id/suspend')
  @RequirePermissions(Permission.MERCHANT_SUSPEND)
  @ApiOperation({ summary: 'Suspend merchant' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async suspend(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new SuspendMerchantCommand(toActor(user), id),
    );
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.MERCHANT_SUSPEND)
  @ApiOperation({ summary: 'Activate merchant' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async activate(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new ActivateMerchantCommand(toActor(user), id),
    );
  }

  @Post(':id/reactivate')
  @RequirePermissions(Permission.MERCHANT_SUSPEND)
  @ApiOperation({ summary: 'Reactivate merchant (alias of activate)' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async reactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.activate(user, id);
  }

  @Post(':id/dormant')
  @RequirePermissions(Permission.MERCHANT_SUSPEND)
  @ApiOperation({ summary: 'Mark merchant as dormant' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async dormant(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new DormantMerchantCommand(toActor(user), id),
    );
  }

  @Get(':id/documents')
  @RequirePermissions(Permission.MERCHANT_KYC_READ)
  @ApiOperation({ summary: 'List merchant KYC documents' })
  @ApiResponse({ status: 200, type: [MerchantDocumentDto] })
  async listDocuments(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantDocumentDto[]> {
    return this.queryBus.execute(
      new ListMerchantDocumentsQuery(toActor(user), id),
    );
  }

  @Get(':id/kyc/reviews')
  @RequirePermissions(Permission.MERCHANT_KYC_READ)
  @ApiOperation({ summary: 'List KYC review history' })
  @ApiResponse({ status: 200, type: [MerchantKycReviewDto] })
  async listKycReviews(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantKycReviewDto[]> {
    return this.queryBus.execute(new ListKycReviewsQuery(toActor(user), id));
  }

  @Post(':id/kyc/documents')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({ summary: 'Register KYC document metadata' })
  @ApiResponse({ status: 201, type: MerchantDocumentDto })
  async addKycDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddKycDocumentDto,
  ): Promise<MerchantDocumentDto> {
    return this.commandBus.execute(
      new AddKycDocumentCommand(
        toActor(user),
        id,
        dto.docType,
        dto.fileName,
        dto.s3Bucket,
        dto.s3Key,
        dto.mimeType,
        dto.fileSize,
      ),
    );
  }

  @Post(':id/kyc/submit')
  @RequirePermissions(Permission.MERCHANT_KYC_WRITE)
  @ApiOperation({ summary: 'Submit merchant KYC for review' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async submitKyc(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(new SubmitKycCommand(toActor(user), id));
  }

  @Post(':id/kyc/review')
  @RequirePermissions(Permission.MERCHANT_KYC_REVIEW)
  @ApiOperation({ summary: 'Review merchant KYC' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async reviewKyc(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewKycDto,
  ): Promise<MerchantResponseDto> {
    return this.commandBus.execute(
      new ReviewKycCommand(toActor(user), id, dto.decision, dto.notes),
    );
  }
}
