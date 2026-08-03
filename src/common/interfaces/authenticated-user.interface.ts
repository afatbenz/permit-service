import { RoleCode } from '../enums/role-code.enum';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  roleId: string;
  roleCode: RoleCode;
}
