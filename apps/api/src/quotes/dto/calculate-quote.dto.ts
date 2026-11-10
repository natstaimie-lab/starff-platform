import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import type { ShiftType } from '../quote-calculator';

export class CalculateQuoteDto {
  /** Base pay rate to the worker, £/hr. */
  @IsNumber() @Min(0.01) payRate: number;

  /** Hours in each shift. */
  @IsNumber() @Min(0.25) hoursPerShift: number;

  /** Shifts each temp works in the week. Default 1. */
  @IsOptional() @IsInt() @Min(1) shifts?: number;

  /** Number of temps. Default 1. */
  @IsOptional() @IsInt() @Min(1) temps?: number;

  @IsOptional() @IsIn(['standard', 'night', 'weekend', 'bank_holiday']) shiftType?: ShiftType;

  /** Starff margin, £/hr. Leave out to use the default margin from rate settings. */
  @IsOptional() @IsNumber() @Min(0) marginPerHour?: number;

  @IsOptional() @IsBoolean() pensionEnrolled?: boolean;
}
