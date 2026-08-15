import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Authenticated join-by-invitation-code. The calling account is already
 * registered (self-register flow); joining links them into the project's
 * organization as a supervisor_subcon, pending org-admin approval.
 */
export class JoinOrganizationDto {
  @IsString()
  @IsNotEmpty()
  invitationCode: string;
}
