import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EnquiryType } from '@prisma/client';

export class CreateEnquiryDto {
  @IsEnum(EnquiryType)
  type: EnquiryType; // CONTACT | POST_A_JOB | CANDIDATE_REGISTER

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  message?: string;

  // Anything extra the form sends is kept here.
  @IsOptional()
  payload?: Record<string, unknown>;
}
