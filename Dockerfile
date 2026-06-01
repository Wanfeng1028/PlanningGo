FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# 移除 devDependencies，只保留生产依赖
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# prisma migrate 需要 schema 文件
COPY --from=build /app/prisma ./prisma

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# 安全提示：生产环境必须提供强 JWT 密钥（>=32 字符，且非默认值）和 COOKIE_SECRET
# 等待 DB 就绪后运行 migrate 并启动服务
CMD ["sh", "-c", "if [ -z \"$JWT_ACCESS_SECRET\" ] || [ -z \"$JWT_REFRESH_SECRET\" ] || [ \"$JWT_ACCESS_SECRET\" = \"change-me-access-secret\" ] || [ \"$JWT_REFRESH_SECRET\" = \"change-me-refresh-secret\" ] || [ \"$JWT_ACCESS_SECRET\" = \"dev-access-secret-change-me-in-production-32b\" ] || [ \"$JWT_REFRESH_SECRET\" = \"dev-refresh-secret-change-me-in-production-32b\" ]; then echo '❌ Unsafe JWT secrets detected. Please set strong production secrets (e.g. openssl rand -hex 32).'; exit 1; fi; if [ -z \"$COOKIE_SECRET\" ] || [ ${#COOKIE_SECRET} -lt 32 ]; then echo '❌ COOKIE_SECRET must be at least 32 characters.'; exit 1; fi; npx prisma migrate deploy && node dist/server/index.js"]
