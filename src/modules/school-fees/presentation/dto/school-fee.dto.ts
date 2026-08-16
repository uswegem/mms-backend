import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';
import { FeePaymentChannel } from '@prisma/client';

export class YearDto { @IsString() name!: string; @IsOptional() @IsDateString() startsOn?: string; @IsOptional() @IsDateString() endsOn?: string; @IsOptional() @IsBoolean() isCurrent?: boolean; }
export class TermDto { @IsUUID() academicYearId!: string; @IsString() name!: string; @IsOptional() @IsInt() sequence?: number; @IsOptional() @IsDateString() startsOn?: string; @IsOptional() @IsDateString() endsOn?: string; }
export class ClassLevelDto { @IsString() code!: string; @IsString() name!: string; @IsOptional() @IsInt() sortOrder?: number; @IsOptional() @IsBoolean() isActive?: boolean; }
export class FeeItemDto { @IsString() code!: string; @IsString() name!: string; @Matches(/^\d+(\.\d{1,2})?$/) amount!: string; @IsOptional() @IsBoolean() isMandatory?: boolean; @IsOptional() @IsDateString() dueDate?: string; @IsOptional() @IsInt() sortOrder?: number; }
export class CreateFeeStructureDto { @IsUUID() academicYearId!: string; @IsUUID() academicTermId!: string; @IsUUID() classLevelId!: string; @IsString() name!: string; @IsArray() @ValidateNested({ each: true }) @Type(() => FeeItemDto) items!: FeeItemDto[]; }
export class UpdateFeeStructureDto { @IsOptional() @IsString() name?: string; @IsArray() @ValidateNested({ each: true }) @Type(() => FeeItemDto) items!: FeeItemDto[]; }
export class GenerateInvoiceDto { @IsUUID() studentId!: string; @IsUUID() academicTermId!: string; }
export class GenerateClassInvoicesDto { @IsUUID() classLevelId!: string; @IsUUID() academicTermId!: string; }
export class CancelInvoiceDto { @IsString() reason!: string; }
export class AdjustmentDto { @IsEnum(['DISCOUNT', 'WAIVER', 'SCHOLARSHIP']) type!: 'DISCOUNT' | 'WAIVER' | 'SCHOLARSHIP'; @IsString() reason!: string; @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) amountOff?: string; @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) percentOff?: string; @IsOptional() @IsUUID() invoiceLineId?: string; }
export class InitiateMockPaymentDto {
  @IsString() paymentReference!: string;
  @Matches(/^\d+(\.\d{1,2})?$/) amount!: string;
  @IsOptional() @IsEnum(['success', 'failure', 'pending']) outcome?: 'success' | 'failure' | 'pending';
  @IsOptional() @IsEnum(FeePaymentChannel) channel?: FeePaymentChannel;
}
export class GatewayNotificationDto extends InitiateMockPaymentDto { @IsString() gatewayTxnRef!: string; }
export class UpdateStudentRegistryDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'SUSPENDED']) status?: 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED' | 'SUSPENDED';
}
export class EnrollStudentDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() classLevelId!: string;
}
