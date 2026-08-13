import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_HAS_DIGIT,
  PASSWORD_HAS_LOWERCASE,
  PASSWORD_HAS_UPPERCASE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NO_WHITESPACE,
  PASSWORD_RULE_MESSAGE,
} from '../../../common/utils/password-policy.util';

/**
 * General self-register: creates a basic account with no organization yet
 * (role 'unassigned', pointing at the sentinel PENDING org). The user then
 * picks Create Organization or Join Organization after logging in.
 *
 * Phone is normalized client-side to the Indonesian "62" prefix — the DTO
 * only accepts that normalized form (digits, starts with 62, ≥ 10 chars).
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^62\d{8,}$/, { message: 'No. telepon harus berawalan 62 dan minimal 10 digit' })
  phone: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_HAS_UPPERCASE, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_HAS_LOWERCASE, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_HAS_DIGIT, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_NO_WHITESPACE, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
