/**
 * 结构化日志
 * 开发环境用 pino-pretty 彩色输出，生产环境输出 JSON
 */

import pino from "pino";
import { env } from "../config/env.js";

export function createLogger() {
  const isDev = env.NODE_ENV !== "production";

  return pino({
    level: isDev ? "debug" : "info",
    transport: isDev
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
  });
}

export type Logger = pino.Logger;
