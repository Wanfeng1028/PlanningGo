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
    await this.userRepo.update(userId, {});

    // 用 raw query 更新 passwordHash（因为 update 不暴露该字段）
    await (this.userRepo as unknown as { db: { user: { update: (args: { where: { id: string }; data: { passwordHash: string } }) => Promise<unknown> } } }).db.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 吊销所有 refresh token，强制重新登录
    await this.tokenService.revokeAllTokens(userId);
  }

  /**
   * Demo 账号快捷登录（兼容旧 API）
   */
  async demoLogin(meta?: { userAgent?: string; ipAddress?: string }) {
    return this.login("xiaoming@example.com", "weekend123", meta);
  }
}
