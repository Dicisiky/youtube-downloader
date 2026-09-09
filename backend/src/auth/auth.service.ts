import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

const LOGIN_SCOPES = ['openid', 'email', 'profile'];
export const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionPayload {
  userId: string;
}

/**
 * "Sign in with Google" for accessing the dashboard itself -- a separate
 * concern from YoutubeAuthService, which authorizes YouTube channels as
 * *upload destinations*. This one answers "is the person looking at this
 * dashboard allowed to be here at all", gated by admin approval.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private newOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get<string>('google.clientId'),
      this.config.get<string>('google.clientSecret'),
      this.config.get<string>('google.loginRedirectUri'),
    );
  }

  getConsentUrl(): string {
    const client = this.newOAuthClient();
    return client.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: LOGIN_SCOPES,
    });
  }

  /**
   * Exchanges the ?code=... from Google's redirect for an ID token, verifies
   * it, and finds-or-creates the matching User row. Brand new accounts start
   * PENDING -- unless the email matches ADMIN_EMAIL, in which case they're
   * auto-approved as admin so the very first login isn't a lockout (nobody
   * else exists yet to approve them).
   */
  async handleGoogleCallback(code: string): Promise<User> {
    const client = this.newOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error('Google did not return an id_token for this login');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.get<string>('google.clientId'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new Error('Could not read a verified email from the Google login');
    }

    const adminEmail = this.config.get<string>('auth.adminEmail', '');
    const isAdminEmail = adminEmail.length > 0 && payload.email.toLowerCase() === adminEmail;

    const existing = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { name: payload.name, picture: payload.picture, email: payload.email },
      });
    }

    this.logger.log(`new login: ${payload.email}${isAdminEmail ? ' (matches ADMIN_EMAIL, auto-approving)' : ' (pending admin approval)'}`);
    return this.prisma.user.create({
      data: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: isAdminEmail ? 'ADMIN' : 'USER',
        status: isAdminEmail ? 'APPROVED' : 'PENDING',
        approvedAt: isAdminEmail ? new Date() : null,
      },
    });
  }

  issueSessionToken(user: User): string {
    const secret = this.requireJwtSecret();
    return jwt.sign({ userId: user.id } satisfies SessionPayload, secret, { expiresIn: '30d' });
  }

  verifySessionToken(token: string): SessionPayload | null {
    try {
      return jwt.verify(token, this.requireJwtSecret()) as SessionPayload;
    } catch {
      return null;
    }
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  get sessionCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    };
  }

  private requireJwtSecret(): string {
    const secret = this.config.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }
}
