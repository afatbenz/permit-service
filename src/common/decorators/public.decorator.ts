import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public (no JWT required).
 * Used for /auth/register, /auth/login, /organizations/join.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
