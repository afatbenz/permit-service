import { IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One project assignment: which project a user is bound to and the role they
 * hold within it. Per-project roles live on `user_project_assignments.role_id`.
 */
export class AssignmentDto {
  @IsUUID()
  projectId: string;

  @IsUUID()
  roleId: string;
}

/**
 * Assigns a role (by id) to a user within an organization. `roleId` sets the
 * *global* role (users.role_id) — the admin-vs-non-admin gate. `assignments`
 * fully replaces the user's ACTIVE project assignments (add / remove / change
 * role per project); each assignment carries its own per-project role.
 *
 * Legacy `projectId` body is still supported for the single project_admin
 * picker (see updateUserRole).
 */
export class UpdateUserRoleDto {
  @IsUUID()
  roleId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  @IsOptional()
  assignments?: AssignmentDto[];

  /**
   * Required when the target role is project_admin — the project this user
   * should administer. Ignored for other roles.
   */
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
