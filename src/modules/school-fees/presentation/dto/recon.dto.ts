import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ExceptionCaseStatus,
  ExceptionResolutionAction,
  ExceptionSeverity,
  ExternalSettlementSource,
  FeePaymentRecordStatus,
} from '@prisma/client';

export class PaymentListQueryDto {
  @IsOptional() @IsEnum(FeePaymentRecordStatus) status?: FeePaymentRecordStatus;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
export class ReversePaymentDto {
  @IsString() reason!: string;
}
export class ResolveDisputeDto {
  @IsEnum(['COMPLETED', 'REVERSED', 'FAILED']) resolution!: 'COMPLETED' | 'REVERSED' | 'FAILED';
  @IsString() reason!: string;
}
export class StartReconciliationDto {
  @IsOptional() @IsEnum(ExternalSettlementSource) source?: ExternalSettlementSource;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) dateWindowDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) softDateVarianceDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) hardDateVarianceDays?: number;
  @IsOptional() @IsBoolean() threeWay?: boolean;
}
export class ReconListQueryDto {
  @IsOptional() @IsEnum(ExternalSettlementSource) source?: ExternalSettlementSource;
}
export class ReconSchoolSummaryQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
}
export class SimFeedDto {
  @IsOptional() @IsEnum(ExternalSettlementSource) source?: ExternalSettlementSource;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;
  @IsOptional() @IsBoolean() threeWay?: boolean;
}

export class ExceptionListQueryDto {
  @IsOptional() @IsEnum(ExceptionCaseStatus) status?: ExceptionCaseStatus;
  @IsOptional() @IsEnum(ExceptionSeverity) severity?: ExceptionSeverity;
  @IsOptional() @IsUUID() merchantId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ExceptionResolvePayloadDto {
  @IsOptional() @IsUUID() feePaymentId?: string;
  @IsOptional() @IsUUID() externalSettlementRecordId?: string;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsString() amount?: string;
  @IsOptional() @IsString() gatewayTxnRef?: string;
  @IsOptional() @IsString() writeOffAmount?: string;
  @IsOptional() @IsString() reason?: string;
}

export class ExceptionResolveDto {
  @IsEnum(ExceptionResolutionAction) action!: ExceptionResolutionAction;
  @IsOptional() @IsString() note?: string;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExceptionResolvePayloadDto)
  payload?: ExceptionResolvePayloadDto;
}
