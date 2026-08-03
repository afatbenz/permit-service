import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Only Super Admin can hit this endpoint (see @Roles on the controller).
 * Creates the Organization tenant plus its first Org Admin user in one
 * transaction, so a new tenant is never left without an admin.
 *
 * organizationCode is intentionally NOT part of this DTO — it's
 * auto-generated server-side from organizationName (5 consonant letters +
 * 3 random digits), see common/utils/organization-code.util.ts.
 */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;

  @IsString()
  @IsNotEmpty()
  adminPhone: string;
}
