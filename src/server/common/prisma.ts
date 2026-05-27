/**
 * 共享 PrismaClient 单例
 * 由 db.ts 插件在连接成功后注入，供非 Fastify 请求上下文的模块使用
 */

import type { PrismaClient } from "../../generated/prisma/client.js";

let _instance: PrismaClient | null = null;

/** 由 db.ts 插件调用，注入已连接的 PrismaClient */
export function setPrismaInstance(instance: PrismaClient | null): void {
  _instance = instance;
}

/** 获取共享 PrismaClient；未注入时返回 null（调用方应做 fallback） */
export function getPrismaClient(): PrismaClient | null {
  return _instance;
}
