import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given role(s). Runs after the global AuthGuard, which already attaches request.user. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
