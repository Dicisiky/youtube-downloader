import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User, UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * Enforces the RBAC boundaries from the feature spec: e.g. only ADMIN can
 * add/remove/pause/stop channels or manage upload destinations, while USER
 * gets read-only access. Relies on the global AuthGuard having already
 * attached an APPROVED user to the request -- this guard only adds the
 * additional role check on top via @Roles(...).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: User }>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenException(`This action requires one of these roles: ${required.join(', ')}`);
    }
    return true;
  }
}
