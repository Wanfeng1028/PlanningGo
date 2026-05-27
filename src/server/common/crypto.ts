/**
 * 密码哈希 + JWT 签发/验证
 * 封装 bcryptjs 和 jsonwebtoken，便于测试时 mock
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import crypto from "node:crypto";
import { env } from "../config/env.js";

// ── 密码哈希 ──

export async function hashPassword(plain: string): Promise<string> {
  const rounds = env.BCRYPT_ROUNDS;
  return bcrypt.hash(plain, rounds);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── JWT ──

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const secret = env.JWT_ACCESS_SECRET;
  const expiresIn = env.JWT_ACCESS_EXPIRES_IN as StringValue;
  return jwt.sign({ ...payload }, secret, { expiresIn });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const secret = env.JWT_REFRESH_SECRET;
  const expiresIn = env.JWT_REFRESH_EXPIRES_IN as StringValue;
  return jwt.sign({ ...payload }, secret, { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = env.JWT_ACCESS_SECRET;
  return jwt.verify(token, secret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const secret = env.JWT_REFRESH_SECRET;
  return jwt.verify(token, secret) as RefreshTokenPayload;
}

/**
 * 生成随机 token（用于 API Key、邀请码等）
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
