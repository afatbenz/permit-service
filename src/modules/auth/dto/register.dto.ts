import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * General self-register: creates a basic account with no organization yet
 * (role 'unassigned', pointing at the sentinel PENDING org). The user then
 * picks Create Organization or Join Organization after logging in.
 *
 * The old token-gated Supervisor Sub-Con registration is covered by the
 * join-organization flow (invite/registration link), not this endpoint.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}
