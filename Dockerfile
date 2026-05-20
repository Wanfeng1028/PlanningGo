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

# 等待 DB 就绪后运行 migrate 并启动服务
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/index.js"]
