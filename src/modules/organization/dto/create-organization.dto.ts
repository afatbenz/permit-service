import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Onboarding create-org form. The account already exists (self-registered,
 * role 'unassigned') — no admin email/password here. The creator is promoted
 * to org_admin of the new org server-side, and a default project + invitation
 * code are created for it.
 */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  province: string;
}
