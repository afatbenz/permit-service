import { IsOptional, IsUUID } from 'class-validator';

/** Assigns a role (by id) to a user within an organization. */
export class UpdateUserRoleDto {
  @IsUUID()
  roleId: string;

  /**
   * Required when the target role is project_admin — the project this user
   * should administer. Ignored for other roles.
   */
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
