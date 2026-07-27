import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { RegistrationSource } from '@prisma/client';

export class RegisterClientDto {
  @IsString()
  companyName: string;

  @IsString()
  contactFirstName: string;

  @IsString()
  contactLastName: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  companyRegNo?: string;

  @IsOptional()
  @IsEnum(RegistrationSource)
  source?: RegistrationSource;
}
