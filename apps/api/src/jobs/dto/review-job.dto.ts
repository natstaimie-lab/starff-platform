import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JobStatus } from '@prisma/client';

export class ApproveJobDto {
  @IsOptional() @IsNumber() @Min(0) payRate?: number;
  @IsOptional() @IsNumber() @Min(0) chargeRate?: number;
  @IsOptional() @IsIn(['manual', 'assisted']) distributionMode?: 'manual' | 'assisted';
  @IsOptional() @IsString() note?: string;
}

export class RejectJobDto {
  @IsString() note: string;
}

export class UpdateJobStatusDto {
  @IsEnum(JobStatus) status: JobStatus;
}

export class InviteCandidatesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) candidateIds: string[];
  @IsOptional() @IsDateString() responseDeadline?: string;
}

export class SubmitToClientDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) applicationIds: string[];
  /** optional curated blurb per application id, shown to the client */
  @IsOptional() summaries?: Record<string, string>;
}
