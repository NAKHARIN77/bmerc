import { HttpStatus, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LEGAL_VERSION } from '../common/legal.js';
import { MailService, webLink } from '../mail/mail.service.js';
import { ApiError, conflict } from '../common/http.js';
import { RateLimiter } from '../common/rate-limit.js';
import { defaultCurrency } from '../common/region.js';
import type { UserTokenType } from '../generated/prisma/enums.js';
import { hashToken, newRefreshToken, REFRESH_TTL_DAYS, signAccessToken } from './tokens.js';

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const badLogin = () => new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
const badLink = () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This link is invalid or has expired');
const tooMany = () =>
  new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in 15 minutes');

const MIN = 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * MIN;
export const RESET_TTL_MS = 60 * MIN;

// Per IP + email. In memory: move to a shared store when running more than one instance.
const loginLimiter = new RateLimiter(5, 15 * MIN);
const forgotLimiter = new RateLimiter(3, 15 * MIN);
const forgotIpLimiter = new RateLimiter(20, 15 * MIN);

/** argon2.verify that treats "no password set yet" as a mismatch. */
const verify = async (hash: string | null, password: string) => !!hash && argon2.verify(hash, password);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async register(input: { companyName: string; country: string; fullName: string; email: string; password: string }, ip?: string) {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_TAKEN', 'This email is already registered');
    }
    // New companies start on Basic (decided 2026-11-22). Billing for the first period comes with plan step 7.
    const basic = await this.prisma.plan.findUnique({ where: { code: 'basic' } });
    if (!basic) throw new Error('Plan "basic" missing: run the seed');
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    const passwordHash = await this.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: input.companyName, country: input.country, currency: defaultCurrency(input.country), billingEmail: email },
      });
      await tx.subscription.create({
        data: { companyId: company.id, planId: basic.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: end, creditWeights: basic.creditWeights ?? undefined },
      });
      return tx.user.create({
        data: { companyId: company.id, email, passwordHash, fullName: input.fullName, role: 'company_admin' },
      });
    });
    // Proof of consent (PDPA): which version of the terms and privacy policy this person agreed to, and when.
    await this.audit.log({ companyId: user.companyId, actorUserId: user.id, action: 'company.registered', after: { acceptedTerms: LEGAL_VERSION }, ip });
    return this.issue(user.id);
  }

  async login(emailRaw: string, password: string, ip = '?', userAgent?: string): Promise<Session> {
    const email = emailRaw.toLowerCase();
    const key = `${ip}|${email}`;
    if (loginLimiter.blocked(key)) throw tooMany();

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = !!user && user.isActive && (await verify(user.passwordHash, password));
    if (!ok) {
      loginLimiter.hit(key);
      await this.audit.log({ companyId: user?.companyId, actorUserId: user?.id, action: 'auth.login_failed', after: { email }, ip });
      throw badLogin();
    }
    loginLimiter.reset(key);
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
    if (!(await verify(user.passwordHash, current))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'WRONG_PASSWORD', 'Current password is incorrect');
    }
    await this.setPassword(userId, next);
    await this.audit.log({ companyId: user.companyId, actorUserId: userId, action: 'auth.password_changed' });
  }

  // ───── Forgot / reset password ─────

  /** Always succeeds from the caller's view, so the response never reveals whether an email is registered. */
  async forgotPassword(emailRaw: string, ip = '?') {
    const email = emailRaw.toLowerCase();
    const key = `${ip}|${email}`;
    if (forgotLimiter.blocked(key) || forgotIpLimiter.blocked(ip)) throw tooMany();
    forgotLimiter.hit(key);
    forgotIpLimiter.hit(ip);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;
    const token = await this.createToken(user.id, 'password_reset', RESET_TTL_MS);
    await this.mail.send({
      to: user.email,
      subject: 'Reset your BMERC password',
      text:
        `Hi ${user.fullName},\n\nSomeone asked to reset the password for this account. ` +
        `Open this link within 1 hour to choose a new password:\n\n${webLink('/reset-password', token)}\n\n` +
        `If you did not ask for this, ignore this email; your password stays the same.`,
    });
    await this.audit.log({ companyId: user.companyId, actorUserId: user.id, action: 'auth.password_reset_requested', ip });
  }

  async resetPassword(token: string, password: string, ip?: string) {
    const row = await this.consumeToken(token, 'password_reset');
    await this.setPassword(row.userId, password);
    await this.audit.log({ companyId: row.user.companyId, actorUserId: row.userId, action: 'auth.password_reset', ip });
  }

  // ───── Invites ─────

  /** Sends (or re-sends) an invite link. Earlier unused invite links for this user stop working. */
  /** True when the email was handed to the mail provider. */
  async sendInvite(userId: string, invitedBy: { id: string; fullName: string }): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { company: true } });
    const token = await this.createToken(user.id, 'invite', INVITE_TTL_MS, invitedBy.id);
    return this.mail.send({
      to: user.email,
      subject: `You're invited to ${user.company?.name ?? 'BMERC'} on BMERC`,
      text:
        `Hi ${user.fullName},\n\n${invitedBy.fullName} added you to ${user.company?.name ?? 'BMERC'}. ` +
        `Open this link within 7 days to set your password and sign in:\n\n${webLink('/accept-invite', token)}`,
    });
  }

  /** For the accept-invite page: who the link is for, without using it up. */
  async inviteInfo(token: string) {
    const row = await this.prisma.userToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { company: true } } },
    });
    if (!row || row.type !== 'invite' || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) throw badLink();
    return { email: row.user.email, fullName: row.user.fullName, companyName: row.user.company?.name ?? null };
  }

  async acceptInvite(token: string, password: string, ip?: string, userAgent?: string): Promise<Session> {
    const row = await this.consumeToken(token, 'invite');
    await this.setPassword(row.userId, password);
    await this.prisma.user.update({ where: { id: row.userId }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ companyId: row.user.companyId, actorUserId: row.userId, action: 'user.invite_accepted', ip });
    return this.issue(row.userId, userAgent);
  }

  // ───── Helpers ─────

  /** New password; every existing session is signed out. */
  private async setPassword(userId: string, password: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hash(password) } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async createToken(userId: string, type: UserTokenType, ttlMs: number, createdById?: string) {
    const raw = newRefreshToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.userToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } }),
      this.prisma.userToken.create({
        data: { userId, type, tokenHash: hashToken(raw), expiresAt: new Date(now.getTime() + ttlMs), createdById },
      }),
    ]);
    return raw;
  }

  /** Marks the token used in one UPDATE, so two requests with the same link cannot both succeed. */
  private async consumeToken(raw: string, type: UserTokenType) {
    const tokenHash = hashToken(raw);
    const now = new Date();
    const { count } = await this.prisma.userToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now }, user: { isActive: true } },
      data: { usedAt: now },
    });
    if (count !== 1) throw badLink();
    return this.prisma.userToken.findUniqueOrThrow({ where: { tokenHash }, include: { user: true } });
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
