import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth/google')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('login')
  login(@Res() res: Response) {
    res.redirect(this.auth.getConsentUrl());
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Query('error') error: string | undefined, @Res() res: Response) {
    const frontendUrl = this.config.get<string>('corsOrigin');
    if (error) {
      return res.redirect(`${frontendUrl}/?login_error=${encodeURIComponent(error)}`);
    }
    try {
      const user = await this.auth.handleGoogleCallback(code);
      const token = this.auth.issueSessionToken(user);
      res.cookie(SESSION_COOKIE, token, this.auth.sessionCookieOptions);
      res.redirect(frontendUrl!);
    } catch (err) {
      res.redirect(`${frontendUrl}/?login_error=${encodeURIComponent((err as Error).message)}`);
    }
  }

  /** Public so the frontend can always ask "who am I / what's my status" without being blocked by the guard itself. */
  @Public()
  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return { authenticated: false };

    const payload = this.auth.verifySessionToken(token);
    if (!payload) return { authenticated: false };

    const user = await this.auth.findUserById(payload.userId);
    if (!user) return { authenticated: false };

    return { authenticated: true, user: this.toPublicUser(user) };
  }

  @Public()
  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      status: user.status,
      role: user.role,
    };
  }
}
