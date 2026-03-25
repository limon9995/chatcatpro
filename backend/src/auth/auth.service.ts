import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';

export type AuthRole = 'admin' | 'client';

// ── Public user shape returned to callers ─────────────────────────────────────
export interface PublicUser {
  id: string;
  username: string;
  email: string | undefined;
  name: string;
  role: AuthRole;
  pageIds: number[];
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionDays = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  // ── Startup: seed admin from env ─────────────────────────────────────────
  async onModuleInit() {
    await this.ensureAdminSeed();
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async register(body: {
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    name?: string;
    role?: string;
    pageIds?: number[];
    isActive?: boolean;
    forcePasswordChange?: boolean;
  }) {
    // Phone number can be used as username — normalize it
    const rawIdentifier = body.username || body.phone || body.email || '';
    const username = this.normalizeUsername(rawIdentifier);
    const email = body.email
      ? String(body.email).trim().toLowerCase()
      : undefined;
    const password = String(body.password || '');

    if (!username)
      throw new UnauthorizedException('Username, phone, or email is required');
    if (!password || password.length < 6)
      throw new ForbiddenException('Password must be at least 6 characters');

    // Check uniqueness
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    });
    if (existing)
      throw new ConflictException('এই username বা email ইতিমধ্যে registered');

    const { salt, passwordHash } = this.hashPassword(password);
    const displayName = body.name?.trim() || username;

    const role = (body.role === 'admin' ? 'admin' : 'client') as AuthRole;
    const user = await this.prisma.user.create({
      data: {
        username,
        email: email ?? null,
        name: displayName,
        role,
        isActive: body.isActive !== false,
        passwordHash,
        salt,
        forcePasswordChange: body.forcePasswordChange ?? false,
        pageIds: JSON.stringify(this.normalizePageIds(body.pageIds || [])),
      },
    });

    // Auto-start 7-day trial for new client accounts
    if (role === 'client') {
      try {
        const plan = await this.prisma.plan.findFirst({ where: { name: 'starter' } });
        if (plan) {
          const now = new Date();
          const trialEnd = new Date(now.getTime() + 7 * 86_400_000);
          await this.prisma.subscription.create({
            data: {
              id: crypto.randomUUID(),
              userId: user.id,
              planId: plan.id,
              status: 'trial',
              periodStart: now,
              periodEnd: new Date(now.getTime() + 30 * 86_400_000),
              ordersLimit: plan.ordersLimit,
              trialEndsAt: trialEnd,
              nextPaymentDue: trialEnd,
            },
          });
          this.logger.log(`[Auth] 7-day trial started for user ${user.id}`);
        }
      } catch (e: any) {
        this.logger.warn(`[Auth] Could not create trial subscription: ${e.message}`);
      }
    }

    return this.publicUser(user);
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(body: {
    username?: string;
    identifier?: string;
    email?: string;
    password?: string;
  }) {
    const identifier = this.normalizeLoginIdentifier(body);
    const password = String(body.password || '');

    const user = await this.findByIdentifier(identifier);
    if (!user) throw new UnauthorizedException('Invalid username or password');
    if (!user.isActive) throw new ForbiddenException('Account is inactive');
    if (!this.verifyPassword(password, user.salt, user.passwordHash))
      throw new UnauthorizedException('Invalid username or password');

    // Clean expired sessions for this user
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    // Enforce max 10 active sessions per user — delete oldest if exceeded
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (sessions.length >= 10) {
      const toDelete = sessions.slice(0, sessions.length - 9).map((s) => s.id);
      await this.prisma.session.deleteMany({ where: { id: { in: toDelete } } });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + this.sessionDays * 86_400_000);
    const token = crypto.randomBytes(32).toString('hex');

    await this.prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        token,
        userId: user.id,
        role: user.role,
        expiresAt: expires,
      },
    });

    return {
      token,
      user: this.publicUser(user),
      expiresAt: expires.toISOString(),
      mustChangePassword: user.forcePasswordChange,
    };
  }

  // ── Me ────────────────────────────────────────────────────────────────────
  async me(token: string) {
    const session = await this.getValidSession(token);
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return this.publicUser(user);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(token: string) {
    await this.prisma.session.deleteMany({ where: { token } });
    return { success: true };
  }

  // ── Get auth user by token (used by AuthGuard) ────────────────────────────
  async getAuthUserByToken(token: string): Promise<PublicUser> {
    const session = await this.getValidSession(token);
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new ForbiddenException('Account is inactive');
    return this.publicUser(user);
  }

  // ── Page access check ─────────────────────────────────────────────────────
  ensurePageAccess(user: PublicUser, pageId: number) {
    if (user.role === 'admin') return true;
    if (!user.pageIds.includes(pageId))
      throw new ForbiddenException('This page is not assigned to your account');
    return true;
  }

  async addPageToUser(userId: string, pageId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const pageIds = this.normalizePageIds(this.parsePageIds(user.pageIds));
    if (!pageIds.includes(pageId)) {
      pageIds.push(pageId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { pageIds: JSON.stringify(pageIds) },
      });
    }
    return { success: true };
  }

  async removePageFromUser(userId: string, pageId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const pageIds = this.normalizePageIds(
      this.parsePageIds(user.pageIds),
    ).filter((id) => id !== pageId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pageIds: JSON.stringify(pageIds) },
    });
    return { success: true };
  }

  // ── Change password ───────────────────────────────────────────────────────
  async changePassword(
    userId: string,
    body: { currentPassword?: string; newPassword?: string },
  ) {
    const current = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (!next || next.length < 8)
      throw new ForbiddenException(
        'New password must be at least 8 characters',
      );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!this.verifyPassword(current, user.salt, user.passwordHash))
      throw new UnauthorizedException('Current password is incorrect');

    const { salt, passwordHash } = this.hashPassword(next);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        salt,
        passwordHash,
        forcePasswordChange: false,
        updatedAt: new Date(),
      },
    });
    return { success: true, message: 'Password changed successfully' };
  }

  // ── Admin: reset password ─────────────────────────────────────────────────
  async adminResetPassword(userId: string, newPassword: string) {
    if (!newPassword || String(newPassword).length < 8)
      throw new ForbiddenException('Password must be at least 8 characters');

    const { salt, passwordHash } = this.hashPassword(String(newPassword));
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        salt,
        passwordHash,
        forcePasswordChange: true,
        updatedAt: new Date(),
      },
    });
    // Invalidate all sessions for this user
    await this.prisma.session.deleteMany({ where: { userId } });
    return { success: true, message: 'Password reset successfully' };
  }

  // ── Admin: list users ─────────────────────────────────────────────────────
  async adminListUsers(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.publicUser(u));
  }

  // ── Admin: update user ────────────────────────────────────────────────────
  async adminUpdateUser(
    userId: string,
    body: {
      name?: string;
      isActive?: boolean;
      role?: string;
      pageIds?: number[];
      forcePasswordChange?: boolean;
    },
  ) {
    const data: any = { updatedAt: new Date() };
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.role !== undefined)
      data.role = body.role === 'admin' ? 'admin' : 'client';
    if (body.pageIds !== undefined)
      data.pageIds = JSON.stringify(this.normalizePageIds(body.pageIds));
    if (body.forcePasswordChange !== undefined)
      data.forcePasswordChange = Boolean(body.forcePasswordChange);

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.publicUser(user);
  }

  // ── Admin: delete user ────────────────────────────────────────────────────
  async adminDeleteUser(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  // ── Migration helper: import from JSON file ───────────────────────────────
  async migrateFromJsonFile(
    usersFilePath: string,
  ): Promise<{ imported: number; skipped: number }> {
    const fs = require('fs');
    if (!fs.existsSync(usersFilePath)) return { imported: 0, skipped: 0 };

    let raw: any[] = [];
    try {
      raw = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    } catch {
      return { imported: 0, skipped: 0 };
    }

    let imported = 0,
      skipped = 0;
    for (const u of raw) {
      const username = this.normalizeUsername(
        u.username || u.email || `user_${u.id}`,
      );
      const existing = await this.prisma.user.findFirst({
        where: { OR: [{ username }, ...(u.email ? [{ email: u.email }] : [])] },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await this.prisma.user.create({
        data: {
          id: u.id || crypto.randomUUID(),
          username,
          email: u.email ?? null,
          name: u.name || username,
          role: u.role || 'client',
          isActive: u.isActive !== false,
          passwordHash: u.passwordHash || '',
          salt: u.salt || '',
          forcePasswordChange: u.forcePasswordChange ?? false,
          pageIds: JSON.stringify(Array.isArray(u.pageIds) ? u.pageIds : []),
          createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        },
      });
      imported++;
    }
    this.logger.log(
      `[Auth Migration] Imported ${imported}, skipped ${skipped}`,
    );
    return { imported, skipped };
  }

  // ── OTP: send signup verification ────────────────────────────────────────
  async sendSignupOtp(email: string): Promise<{ message: string }> {
    const norm = email.trim().toLowerCase();
    if (!norm.includes('@')) throw new ForbiddenException('Valid email দিন');
    const existing = await this.prisma.user.findFirst({
      where: { email: norm },
    });
    if (existing)
      throw new ConflictException('এই email দিয়ে ইতিমধ্যে account আছে');
    await this.otp.sendOtp(norm, 'signup');
    return { message: 'OTP পাঠানো হয়েছে' };
  }

  // ── OTP: verify signup OTP + create account ───────────────────────────────
  async verifySignupOtp(body: {
    email: string;
    code: string;
    name: string;
    username?: string;
    password: string;
  }): Promise<PublicUser> {
    const email = body.email.trim().toLowerCase();
    const valid = await this.otp.verifyOtp(email, body.code, 'signup');
    if (!valid) throw new UnauthorizedException('OTP ভুল অথবা মেয়াদ শেষ');
    const username = body.username?.trim() || email;
    return this.register({
      email,
      username,
      password: body.password,
      name: username,
      role: 'client',
      isActive: true,
    });
  }

  // ── OTP: send forgot-password OTP ─────────────────────────────────────────
  async sendResetOtp(email: string): Promise<{ message: string }> {
    const norm = email.trim().toLowerCase();
    if (!norm.includes('@')) throw new ForbiddenException('Valid email দিন');
    const user = await this.prisma.user.findFirst({ where: { email: norm } });
    if (!user) throw new NotFoundException('এই email দিয়ে কোনো account নেই');
    await this.otp.sendOtp(norm, 'reset');
    return { message: 'OTP পাঠানো হয়েছে' };
  }

  // ── OTP: reset password via OTP ───────────────────────────────────────────
  async resetPasswordByOtp(body: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const email = body.email.trim().toLowerCase();
    if (!body.newPassword || body.newPassword.length < 6)
      throw new ForbiddenException('Password কমপক্ষে ৬ character হতে হবে');

    const valid = await this.otp.verifyOtp(email, body.code, 'reset');
    if (!valid) throw new UnauthorizedException('OTP ভুল অথবা মেয়াদ শেষ');

    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    const { salt, passwordHash } = this.hashPassword(body.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        salt,
        passwordHash,
        forcePasswordChange: false,
        updatedAt: new Date(),
      },
    });
    // Invalidate all existing sessions
    await this.prisma.session.deleteMany({ where: { userId: user.id } });
    return { message: 'Password reset সফল হয়েছে' };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getValidSession(token: string) {
    if (!token) throw new UnauthorizedException('Missing token');
    // Single DB query — no file I/O, no race condition
    const session = await this.prisma.session.findUnique({
      where: { token },
    });
    if (!session) throw new UnauthorizedException('Invalid or expired token');
    if (session.expiresAt < new Date()) {
      // Lazy cleanup — delete expired session
      await this.prisma.session.delete({ where: { token } }).catch(() => {});
      throw new UnauthorizedException('Session expired — please log in again');
    }
    return session;
  }

  private async findByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });
  }

  private async ensureAdminSeed() {
    const adminEmail = String(process.env.AUTH_ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const adminUsername = this.normalizeUsername(
      process.env.AUTH_ADMIN_USERNAME || adminEmail || 'admin',
    );
    const adminPassword = String(process.env.AUTH_ADMIN_PASSWORD || '').trim();
    if (!adminUsername || !adminPassword) return;

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: adminUsername },
          ...(adminEmail ? [{ email: adminEmail }] : []),
        ],
      },
    });
    if (existing) return;

    const { salt, passwordHash } = this.hashPassword(adminPassword);
    await this.prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail || null,
        name: 'Admin',
        role: 'admin',
        isActive: true,
        passwordHash,
        salt,
        forcePasswordChange: false,
        pageIds: '[]',
      },
    });
    this.logger.log(`[Auth] Admin user "${adminUsername}" created from env`);
  }

  publicUser(user: any): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? undefined,
      name: user.name || user.username,
      role: user.role as AuthRole,
      pageIds: this.parsePageIds(user.pageIds),
      isActive: user.isActive,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      createdAt:
        user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : String(user.createdAt),
    };
  }

  private hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, passwordHash };
  }

  private verifyPassword(
    password: string,
    salt: string,
    hash: string,
  ): boolean {
    if (!salt || !hash) return false;
    try {
      const derived = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  private normalizeUsername(value: any) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private normalizeLoginIdentifier(body: {
    username?: string;
    identifier?: string;
    email?: string;
  }) {
    const raw = body.username || body.identifier || body.email || '';
    const n = String(raw).trim().toLowerCase();
    if (!n) throw new UnauthorizedException('username is required');
    return n;
  }

  private normalizePageIds(input: Array<number | string>) {
    return [
      ...new Set(
        input
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.floor(n)),
      ),
    ];
  }

  private parsePageIds(raw: string): number[] {
    try {
      return JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }
}
