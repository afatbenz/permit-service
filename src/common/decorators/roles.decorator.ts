import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '../enums/role-code.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given role codes. Combine with the global
 * RolesGuard (see common/guards/roles.guard.ts).
 *
 * Example:
 *   @Roles(RoleCode.SUPER_ADMIN)
 *   @Post()
 *   create(...) {}
 */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
