import { IsEmail, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Self-register for Supervisor Sub-Con only. organizationId, projectId and
 * roleId are NEVER accepted from the client — they're resolved server-side
 * from `registrationToken` (see AuthService.register()).
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

  @IsUUID()
  subconCompanyId: string;

  @IsString()
  @IsNotEmpty()
  registrationToken: string;
}
