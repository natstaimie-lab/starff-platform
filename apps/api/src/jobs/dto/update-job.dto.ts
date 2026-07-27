import { IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** Amend an existing job's operational details. Every field is optional — only
 *  the ones provided are changed. Status changes go through the status/review
 *  endpoints, not here. */
export class UpdateJobDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsString() siteId?: string;

  @IsOptional() @IsNumber() @Min(0) payRate?: number;
  @IsOptional() @IsNumber() @Min(0) chargeRate?: number;
  @IsOptional() @IsInt() @Min(1) openings?: number;

  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;

  @IsOptional() @IsString() ppe?: string;
  @IsOptional() @IsString() uniform?: string;
  @IsOptional() @IsString() siteInstructions?: string;
  @IsOptional() @IsString() reportingContact?: string;
  @IsOptional() @IsString() reportingInstructions?: string;
  @IsOptional() @IsString() requiredQualifications?: string;
  @IsOptional() @IsString() experienceRequirements?: string;
  @IsOptional() @IsString() transportRequirements?: string;
  @IsOptional() @IsString() clientRequirements?: string;
  @IsOptional() @IsString() bookingUrgency?: string;
  @IsOptional() @IsString() breakInfo?: string;
  @IsOptional() @IsString() notes?: string;

  // ── recurring / ongoing pattern ──
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) recurrenceDays?: number[];
  @IsOptional() @IsString() shiftStartTime?: string;
  @IsOptional() @IsString() shiftEndTime?: string;
}
