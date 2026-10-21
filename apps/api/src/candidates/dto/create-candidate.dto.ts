import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCandidateDto {
  // The Supabase auth user id (uuid) this candidate profile belongs to.
  // Optional: when an admin adds a candidate manually there is no auth user yet,
  // so the API generates one.
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  // Admin front desk: when a real email is given, email the portal set-password
  // invite now. Without this the login is still created but no email is sent.
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;

  // Where the sign-up came from, for the staff "new sign-up" alert.
  // PORTAL (candidate web portal), MOBILE (app), or WEBSITE (from starff.co.uk).
  @IsOptional()
  @IsIn(['WEBSITE', 'MOBILE', 'PORTAL'])
  source?: string;

  // The work sectors the candidate is looking for (from the canonical list).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSectors?: string[];
}
