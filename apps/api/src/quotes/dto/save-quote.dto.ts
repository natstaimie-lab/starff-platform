import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber,
  IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { QuoteStatus } from '@prisma/client';
import type { ShiftType } from '../quote-calculator';

export class QuoteLineDto {
  /** The role, e.g. "Warehouse operative". */
  @IsString() @MaxLength(200) description: string;
  @IsNumber() @Min(0.01) payRate: number;
  /** Leave out to use the default margin from rate settings. */
  @IsOptional() @IsNumber() @Min(0) marginPerHour?: number;
  @IsNumber() @Min(0.25) hoursPerShift: number;
  @IsOptional() @IsInt() @Min(1) shifts?: number;
  @IsOptional() @IsInt() @Min(1) temps?: number;
  @IsOptional() @IsIn(['standard', 'night', 'weekend', 'bank_holiday']) shiftType?: ShiftType;
  @IsOptional() @IsBoolean() pensionEnrolled?: boolean;
}

export class SaveQuoteDto {
  /** An existing client, or leave out and give prospectName. */
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() @MaxLength(200) prospectName?: string;
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  /** Date the quote stops being valid (YYYY-MM-DD). Defaults to 30 days from today. */
  @IsOptional() @IsDateString() validUntil?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
}

export class QuoteStatusDto {
  @IsIn(Object.values(QuoteStatus)) status: QuoteStatus;
}

export class SendQuoteDto {
  /** Who gets the quote. Defaults to the quote's contact email. */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @IsEmail({}, { each: true }) to?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsEmail({}, { each: true }) cc?: string[];
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  /** The covering message. A friendly default is used if left out. */
  @IsOptional() @IsString() @MaxLength(5000) message?: string;
}
