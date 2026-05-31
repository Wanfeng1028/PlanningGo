/**
 * Token 服务 — JWT 签发 + Refresh Token 管理
 */

import crypto from "node:crypto";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  
} from "../common/crypto.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { env } from "../config/env.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class TokenService {
  constructor(private userRepo: UserRepository) {}

  /**
   * 为已认证用户生成 token pair，refresh token 存入 DB
   */
  async issueTokenPair(
    userId: string,
    email: string,
    role: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const jti = crypto.randomUUID();

    const accessToken = signAccessToken({ sub: userId, email, role });
    const refreshToken = signRefreshToken({ sub: userId, jti });

    const refreshExpiresIn = env.JWT_REFRESH_EXPIRES_IN;
    const expiresAt = this.parseExpiresIn(refreshExpiresIn);

    await this.userRepo.createRefreshToken({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    });

    return { accessToken, refreshToken };
  }

  /**
   * 刷新 token：验证旧 refresh token，签发新 pair
   */
  async refreshTokens(oldRefreshToken: string, meta?: { userAgent?: string; ipAddress?: string }): Promise<TokenPair | null> {
    try {
      const payload = verifyRefreshToken(oldRefreshToken);
      const tokenHash = hashToken(oldRefreshToken);

      const stored = await this.userRepo.findRefreshToken(tokenHash);
      if (!stored) return null;

      // 吊销旧 token
      await this.userRepo.revokeRefreshToken(stored.id);

      // 查用户
      const user = await this.userRepo.findById(payload.sub);
      if (!user || user.status !== "active") return null;

      // 签发新 pair
      return this.issueTokenPair(user.id, user.email, user.role, meta);
    } catch {
      return null;
    }
  }

  /**
   * 登出：吊销当前 refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.userRepo.findRefreshToken(tokenHash);
    if (stored) {
      await this.userRepo.revokeRefreshToken(stored.id);
    }
  }

  /**
   * 登出所有设备：吊销该用户所有 refresh token
   */
  async revokeAllTokens(userId: string): Promise<void> {
    await this.userRepo.revokeAllRefreshTokens(userId);
  }

  private parseExpiresIn(value: string): Date {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + num * (multipliers[unit] ?? 86_400_000));
  }
}
