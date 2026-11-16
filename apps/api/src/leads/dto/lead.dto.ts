import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { LeadActivityType, LeadSource, LeadStage } from '@prisma/client';

/** Details shared by create and update. All optional on update. */
class LeadDetailsDto {
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
  /** Their job title, e.g. "Operations Manager". */
  @IsOptional() @IsString() @MaxLength(200) contactRole?: string;
  @IsOptional() @IsString() @MaxLength(100) sector?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string;
  /** Rough value in £ per month, if known. */
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  /** Staff member responsible for the lead (user id). */
  @IsOptional() @IsUUID() ownerId?: string;
  /** When to follow up next (ISO date or date-time). */
  @IsOptional() @IsDateString() nextActionAt?: string;
}

export class CreateLeadDto extends LeadDetailsDto {
  /** Company name. Required unless enquiryId or clientId supplies it. */
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  /** Start from a website enquiry — fills in the blanks from it. One lead per enquiry. */
  @IsOptional() @IsString() enquiryId?: string;
  /** Link to an existing client (usually one at LEAD or PROSPECT). */
  @IsOptional() @IsString() clientId?: string;
  /** Defaults to ENQUIRY / CLIENT when those ids are given, else MANUAL (or AI when createdByAi). */
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  /** Starting stage. Defaults to NEW (CONTACTED for a client already past LEAD). */
  @IsOptional() @IsIn([LeadStage.NEW, LeadStage.CONTACTED, LeadStage.QUALIFIED]) stage?: LeadStage;
  /** Set by the AI salesperson so people can see which leads it added. */
  @IsOptional() @IsBoolean() createdByAi?: boolean;
}

export class UpdateLeadDto extends LeadDetailsDto {
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() clientId?: string;
}

export class LogActivityDto {
  @IsIn([LeadActivityType.CALL, LeadActivityType.EMAIL, LeadActivityType.NOTE, LeadActivityType.MEETING])
  type: LeadActivityType;
  @IsOptional() @IsIn(['inbound', 'outbound']) direction?: 'inbound' | 'outbound';
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  /** Short result, e.g. "no answer", "wants a quote". */
  @IsOptional() @IsString() @MaxLength(300) outcome?: string;
  /** When it happened. Defaults to now. */
  @IsOptional() @IsDateString() occurredAt?: string;
  /** Also set the lead's next follow-up date. */
  @IsOptional() @IsDateString() nextActionAt?: string;
  @IsOptional() @IsBoolean() byAi?: boolean;
}

export class ChangeStageDto {
  @IsEnum(LeadStage) stage: LeadStage;
  /** Required when moving to LOST. */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Optional note saved with the stage change. */
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
  @IsOptional() @IsBoolean() byAi?: boolean;
}
