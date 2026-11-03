import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType, RegistrationSource } from '@prisma/client';

export class RegisterDocumentDto {
  @IsEnum(DocumentType)
  type: DocumentType;

  /** Path of an already-uploaded file in the `candidate-documents` bucket. */
  @IsString()
  fileUrl: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}

export class RegisterCandidateDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  /** ISO date (YYYY-MM-DD). Collected by the website register form; 18+ enforced. */
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  /** Right-to-work declaration (British/Irish, Settled, Visa…). */
  @IsOptional()
  @IsString()
  rightToWorkType?: string;

  /** Free-text sector/role, stored on the candidate headline. */
  @IsOptional()
  @IsString()
  sector?: string;

  /** The work sectors the candidate is looking for (from the canonical list). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSectors?: string[];

  @IsOptional()
  @IsEnum(RegistrationSource)
  source?: RegistrationSource;

  /** Optional documents already uploaded to storage (e.g. RTW, CV). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterDocumentDto)
  documents?: RegisterDocumentDto[];
}
