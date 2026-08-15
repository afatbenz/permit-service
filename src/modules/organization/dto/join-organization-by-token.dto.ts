import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/**
 * Legacy invite-token flow: an invitee completes their account using the
 * token from an org admin's invite email. New onboarding uses
 * JoinOrganizationDto (invitation code) instead.
 */
export class JoinOrganizationByTokenDto {
  @IsString()
  @IsNotEmpty()
  inviteToken: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}
