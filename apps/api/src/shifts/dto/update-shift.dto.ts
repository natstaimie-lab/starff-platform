import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ShiftStatus } from '@prisma/client';

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;
}
