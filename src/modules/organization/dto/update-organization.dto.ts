import { IsOptional, IsString } from 'class-validator';

/**
 * Org-settings card 1: edit company name / address / city / province.
 * All fields optional for partial updates.
 */
export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  province?: string;
}
