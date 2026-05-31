/**
 * Auth 业务服务 — 注册 / 登录 / Guest / 密码管理
 */

import { randomUUID } from "node:crypto";
import { hashPassword, comparePassword } from "../common/crypto.js";
import { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } from "../common/errors.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { ProfileRepository } from "../repositories/profileRepository.js";
import type { TokenService, TokenPair } from "./tokenService.js";

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private profileRepo: ProfileRepository,
    private tokenService: TokenService,
  ) {}

  /**
   * 邮箱注册
   */
  async register(
    email: string,
    password: string,
    displayName?: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    if (!email || !password) throw new BadRequestError("邮箱和密码不能为空");
    if (password.length < 6) throw new BadRequestError("密码至少6位");

    const existing = await this.userRepo.findByEmail(email);
    if (existing) throw new ConflictError("该邮箱已被注册");

    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create({
      email,
      passwordHash,
      displayName: displayName ?? email.split("@")[0],
      role: "user",
      mode: "registered",
    });

    // 创建默认 profile 和 permissions
    await Promise.all([
      this.profileRepo.upsert(user.id, {}),
      this.profileRepo.upsertPermissions(user.id, {}),
    ]);

    const tokens = await this.tokenService.issueTokenPair(user.id, user.email, user.role, meta);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      ...tokens,
    };
  }

  /**
   * 邮箱登录
   */
  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ user: { id: string; email: string; displayName: string; role: string } } & TokenPair> {
    if (!email || !password) throw new BadRequestError("邮箱和密码不能为空");

    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.passwordHash) throw new UnauthorizedError("邮箱或密码错误");
    if (user.status !== "active") throw new UnauthorizedError("账号已被禁用");

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("邮箱或密码错误");

    const tokens = await this.tokenService.issueTokenPair(user.id, user.email, user.role, meta);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      ...tokens,
    };
  }

  /**
   * Guest 快速体验 — 支持完整画像字段
   */
  async guestLogin(
    meta?: { userAgent?: string; ipAddress?: string },
    profile?: {
      city?: string;
      startPoint?: string;
      companions?: string;
      budgetMin?: number;
      budgetMax?: number;
      homeLat?: number;
      homeLng?: number;
      locationLabel?: string;
      locationSource?: string;
    },
  ): Promise<{ user: { id: string; email: string; displayName: string; role: string } } & TokenPair> {
    const guestId = randomUUID();
    const guestEmail = `guest-${guestId.slice(0, 8)}@planninggo.local`;

    const user = await this.userRepo.create({
      email: guestEmail,
      displayName: profile?.locationLabel ?? "体验用户",
      role: "user",
      mode: "guest",
    });

    await Promise.all([
      this.profileRepo.upsert(user.id, {
        city: profile?.city ?? "北京",
        startPoint: profile?.startPoint ?? "家附近",
        companions: profile?.companions ?? "family",
        budgetMin: profile?.budgetMin ?? 200,
        budgetMax: profile?.budgetMax ?? 300,
        homeLat: profile?.homeLat,
        homeLng: profile?.homeLng,
      }),
      this.profileRepo.upsertPermissions(user.id, {}),
    ]);

    const tokens = await this.tokenService.issueTokenPair(user.id, user.email, user.role, meta);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      ...tokens,
    };
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (!oldPassword || !newPassword) throw new BadRequestError("请提供旧密码和新密码");
    if (newPassword.length < 6) throw new BadRequestError("新密码至少6位");

    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError("用户不存在");
    if (!user.passwordHash) throw new BadRequestError("当前账号未设置密码");

    const valid = await comparePassword(oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError("旧密码错误");

    const passwordHash = await hashPassword(newPassword);
    await this.userRepo.updatePasswordHash(userId, passwordHash);

    // 吊销所有 refresh token，强制重新登录
    await this.tokenService.revokeAllTokens(userId);
  }

  /**
   * 请求密码重置 — 生成重置 token
   * 返回 token（生产环境应通过邮件发送，开发环境返回给前端）
   */
  async requestPasswordReset(
    email: string,
  ): Promise<{ token: string; expiresAt: Date } | null> {
    if (!email) throw new BadRequestError("请提供邮箱");

    const user = await this.userRepo.findByEmail(email);
    // 安全：不暴露邮箱是否存在
    if (!user || user.status !== "active") return null;

    const crypto = await import("node:crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store via userRepo if method exists, otherwise skip (memory mode)
    if ("createPasswordResetToken" in this.userRepo) {
      await (this.userRepo as any).createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    }

    return { token, expiresAt };
  }

  /**
   * 重置密码 — 验证 token 并更新密码
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<void> {
    if (!token || !newPassword) throw new BadRequestError("请提供重置令牌和新密码");
    if (newPassword.length < 6) throw new BadRequestError("新密码至少6位");

    const crypto = await import("node:crypto");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Try DB lookup if method exists
    if ("findPasswordResetToken" in this.userRepo && "usePasswordResetToken" in this.userRepo) {
      const record = await (this.userRepo as any).findPasswordResetToken(tokenHash);
      if (!record) throw new BadRequestError("重置令牌无效或已过期");

      const passwordHash = await hashPassword(newPassword);
      await this.userRepo.updatePasswordHash(record.userId, passwordHash);
      await (this.userRepo as any).usePasswordResetToken(record.id);
      await this.tokenService.revokeAllTokens(record.userId);
      return;
    }

    throw new BadRequestError("密码重置功能暂不可用");
  }

  /**
   * Demo 账号快捷登录（兼容旧 API）
   */
  async demoLogin(meta?: { userAgent?: string; ipAddress?: string }) {
    return this.login("xiaoming@example.com", "weekend123", meta);
  }
}
