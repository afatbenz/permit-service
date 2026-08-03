import { RoleCode } from '../../../common/enums/role-code.enum';

export interface JwtPayload {
  sub: string; // user id
  organizationId: string;
  roleId: string;
  roleCode: RoleCode;
}
