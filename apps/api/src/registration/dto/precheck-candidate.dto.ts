import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for POST /registration/candidate/precheck — the sign-up form's fields. */
export class PrecheckCandidateDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsOptional() @IsString() @MaxLength(100)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsDateString()
  dateOfBirth?: string;
}
