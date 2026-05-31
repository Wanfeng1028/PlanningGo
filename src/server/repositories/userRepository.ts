/**
 * 用户仓库 — 封装 User + RefreshToken 的数据库操作
 */

import type { PrismaClient } from "../../generated/prisma/client.js";

export class UserRepository {
  constructor(private db: PrismaClient) {}

  async findById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  async create(data: {
    email: string;
    passwordHash?: string;
    displayName?: string;
    role?: string;
    mode?: string;
  }) {
    return this.db.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        displayName: data.displayName ?? "周末用户",
        role: data.role ?? "user",
        mode: data.mode ?? "registered",
      },
    });
  }

  async update(id: string, data: { displayName?: string; emailVerifiedAt?: Date }) {
    return this.db.user.update({ where: { id }, data });
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    return this.db.user.update({ where: { id }, data: { passwordHash } });
  }

  async softDelete(id: string) {
    return this.db.user.update({
      where: { id },
      data: { status: "disabled", deletedAt: new Date() },
    });
  }

  // ── Refresh Token ──

  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    return this.db.refreshToken.create({ data });
  }

  async findRefreshToken(tokenHash: string) {
    return this.db.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async revokeRefreshToken(id: string) {
    return this.db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllRefreshTokens(userId: string) {
    return this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async cleanExpiredTokens() {
    return this.db.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  // ── Password Reset Token ──

  async createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.db.passwordResetToken.create({ data });
  }

  async findPasswordResetToken(tokenHash: string) {
    return this.db.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async usePasswordResetToken(id: string) {
    return this.db.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
