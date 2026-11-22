import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../common/http.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, type Session } from './auth.service.js';
import { ACCESS_COOKIE } from './auth.guard.js';
import { AllowSuspended, CurrentUser, Public } from './decorators.js';
import { ACCESS_TTL_SECONDS } from './tokens.js';
import type { AuthUser } from './auth-user.js';

const REFRESH_COOKIE = 'bmerc_rt';
const password = z.string().min(8, 'At least 8 characters').max(200);
const RegisterBody = z.object({
  companyName: z.string().trim().min(2).max(200),
  fullName: z.string().trim().min(2).max(200),
  email: z.email(),
  password,
});
const LoginBody = z.object({ email: z.email(), password: z.string().min(1) });
const ChangePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: password });

const secure = () => process.env.NODE_ENV === 'production';

function setSession(res: Response, s: Session) {
  res.cookie(ACCESS_COOKIE, s.accessToken, {
    httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, s.refreshToken, {
    httpOnly: true, sameSite: 'lax', secure: secure(), path: '/api/v1/auth', expires: s.refreshExpiresAt,
  });
  return { accessToken: s.accessToken, expiresIn: ACCESS_TTL_SECONDS };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return setSession(res, await this.auth.register(parse(RegisterBody, body), req.ip));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parse(LoginBody, body);
    return setSession(res, await this.auth.login(b.email, b.password, req.ip, req.headers['user-agent']));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return setSession(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}

@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @AllowSuspended()
  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const company = user.companyId
      ? await this.prisma.company.findUnique({
          where: { id: user.companyId },
          select: {
            id: true, name: true, status: true,
            subscription: { select: { status: true, plan: { select: { code: true, name: true } } } },
          },
        })
      : null;
    return { ...user, company };
  }

  @AllowSuspended()
  @Patch('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = parse(ChangePasswordBody, body);
    await this.auth.changePassword(user.id, b.currentPassword, b.newPassword);
  }
}
