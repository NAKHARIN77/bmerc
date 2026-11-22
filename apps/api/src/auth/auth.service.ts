import { HttpStatus, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, conflict } from '../common/http.js';
import { hashToken, newRefreshToken, REFRESH_TTL_DAYS, signAccessToken } from './tokens.js';

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const badLogin = () => new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

// In-memory limiter for login attempts (per IP + email). Move to a shared store when running more than one instance.
const attempts = new Map<string, { n: number; until: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async register(input: { companyName: string; fullName: string; email: string; password: string }, ip?: string) {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_TAKEN', 'This email is already registered');
    }
    const trial = await this.prisma.plan.findUnique({ where: { code: 'trial' } });
    if (!trial) throw new Error('Plan "trial" missing: run the seed');
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const passwordHash = await this.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: input.companyName, billingEmail: email } });
      await tx.subscription.create({
        data: { companyId: company.id, planId: trial.id, status: 'trialing', currentPeriodStart: now, currentPeriodEnd: end },
      });
      return tx.user.create({
        data: { companyId: company.id, email, passwordHash, fullName: input.fullName, role: 'company_admin' },
      });
    });
    await this.audit.log({ companyId: user.companyId, actorUserId: user.id, action: 'company.registered', ip });
    return this.issue(user.id);
  }

  async login(emailRaw: string, password: string, ip = '?', userAgent?: string): Promise<Session> {
    const email = emailRaw.toLowerCase();
    const key = `${ip}|${email}`;
    const a = attempts.get(key);
    if (a && a.n >= MAX_ATTEMPTS && a.until > Date.now()) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in 15 minutes');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = !!user && user.isActive && (await argon2.verify(user.passwordHash, password));
    if (!ok) {
      const cur = a && a.until > Date.now() ? a.n : 0;
      attempts.set(key, { n: cur + 1, until: Date.now() + WINDOW_MS });
      await this.audit.log({ companyId: user?.companyId, actorUserId: user?.id, action: 'auth.login_failed', after: { email }, ip });
      throw badLogin();
    }
    attempts.delete(key);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ companyId: user.companyId, actorUserId: user.id, action: 'auth.login', ip });
    return this.issue(user.id, userAgent);
  }

  /** Rotation: the old refresh token is revoked and a new one issued. */
  async refresh(token: string | undefined, userAgent?: string): Promise<Session> {
    const relogin = () => new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Please log in again');
    if (!token) throw relogin();
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.isActive) throw relogin();
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issue(row.userId, userAgent);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'WRONG_PASSWORD', 'Current password is incorrect');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hash(next) } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ companyId: user.companyId, actorUserId: userId, action: 'auth.password_changed' });
  }

  private async issue(userId: string, userAgent?: string): Promise<Session> {
    const refreshToken = newRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt, userAgent },
    });
    return { accessToken: await signAccessToken(userId), refreshToken, refreshExpiresAt };
  }
}
