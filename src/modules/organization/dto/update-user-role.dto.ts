import { IsUUID } from 'class-validator';

/** Assigns a role (by id) to a user within an organization. */
export class UpdateUserRoleDto {
  @IsUUID()
  roleId: string;
}
