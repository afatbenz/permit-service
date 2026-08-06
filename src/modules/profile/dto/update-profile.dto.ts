import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Editable profile fields. Applied transactionally with the optional
 * `signature` data URL so a single request updates both the profile row and
 * the stored signature file.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  /**
   * Base64 data URL produced by canvas.toDataURL('image/png') — the manual
   * draw path. If present, it is stored like an uploaded file.
   * Example: `data:image/png;base64,iVBORw0KGgo...`
   */
  @IsOptional()
  @IsString()
  signature?: string;
}
