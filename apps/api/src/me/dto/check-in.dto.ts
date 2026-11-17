import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Where the phone was when the worker checked in or out (from the app's GPS). */
export class ShiftLocationDto {
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  /** GPS accuracy radius in metres, as reported by the phone. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy?: number;
}

export class CheckInDto extends ShiftLocationDto {
  /** Storage path of the selfie the app took at clock-in (`<userId>/...jpg`). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  photoPath?: string;
}

export class CheckOutDto extends ShiftLocationDto {}
