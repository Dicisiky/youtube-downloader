import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Applied globally (see AppModule's APP_GUARD provider) so every route is
 * locked down by default -- routes opt OUT via @Public(), rather than each
 * feature module having to remember to opt in. This is what satisfies
 * "all core application routes and features must remain locked" for anyone
 * who isn't an approved, logged-in user.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');

    const payload = this.auth.verifySessionToken(token);
    if (!payload) throw new UnauthorizedException('Session expired or invalid');

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    if (user.status !== 'APPROVED') {
      throw new ForbiddenException('Your account has not been approved by an admin yet');
    }

    (request as Request & { user: typeof user }).user = user;
    return true;
  }
}
