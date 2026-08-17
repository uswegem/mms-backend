import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateTransactionLimitPolicyDto {
  @ApiPropertyOptional({ example: 5000000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  perTransactionLimit?: number;

  @ApiPropertyOptional({ example: 20000000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  dailyLimit?: number;

  @ApiPropertyOptional({ example: 100000000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  monthlyLimit?: number;
}
