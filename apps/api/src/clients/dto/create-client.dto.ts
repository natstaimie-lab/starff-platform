import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ClientStatus } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  name: string;

  // Optional primary contact — if an email is given, they are invited to the client portal.
  @IsOptional()
  @IsString()
  contactFirstName?: string;

  @IsOptional()
  @IsString()
  contactLastName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  billingEmail?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}
