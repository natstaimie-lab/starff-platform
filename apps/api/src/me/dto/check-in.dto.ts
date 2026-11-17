import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckInDto {
  /** Storage path of the selfie the app took at clock-in (`<userId>/...jpg`). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  photoPath?: string;
}
