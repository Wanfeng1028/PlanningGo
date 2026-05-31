#!/usr/bin/env bash
# scripts/deploy.sh — PlanningGo 一键部署脚本
# 用法: bash scripts/deploy.sh

set -euo pipefail

echo "?? PlanningGo 部署脚本"
echo "========================"

# 1. 检查 .env.production
if [ ! -f .env.production ]; then
  echo "? 未找到 .env.production"
  echo "   正在从模板创建..."
  cp .env.production.template .env.production
  echo "   ?? 请编辑 .env.production 填入以下必填项："
  echo "      - DATABASE_URL (PostgreSQL)"
  echo "      - REDIS_URL (Redis)"
  echo "      - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET"
  echo "      - COOKIE_SECRET"
  echo "      - AMAP_WEB_SERVICE_KEY (高德地图)"
  echo "      - OPENAI_API_KEY (任选一个 LLM 服务)"
  echo ""
  echo "   生成密钥命令: openssl rand -hex 32"
  echo ""
  exit 1
fi

# 2. 检查必填项
source .env.production 2>/dev/null || true

check_env() {
  local name=$1
  local value=${!name:-}
  if [ -z "$value" ]; then
    echo "? 缺少必填环境变量: $name"
    return 1
  fi
}

errors=0
check_env "JWT_ACCESS_SECRET" || errors=$((errors + 1))
check_env "JWT_REFRESH_SECRET" || errors=$((errors + 1))
check_env "COOKIE_SECRET" || errors=$((errors + 1))
check_env "AMAP_WEB_SERVICE_KEY" || errors=$((errors + 1))

# 检查 LLM（至少配一个）
if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${QWEN_API_KEY:-}" ]; then
  echo "? 缺少 LLM API Key（OPENAI_API_KEY 或 QWEN_API_KEY 至少配一个）"
  errors=$((errors + 1))
fi

if [ $errors -gt 0 ]; then
  echo ""
  echo "? 有 $errors 个必填项未配置，请编辑 .env.production"
  exit 1
fi

echo "? 环境变量检查通过"

# 3. 构建并启动
echo ""
echo "?? 构建并启动服务..."
docker compose -f docker-compose.prod.yml up -d --build

# 4. 等待健康检查
echo ""
echo "? 等待服务就绪..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "? 服务已就绪！"
    echo ""
    echo "?? 访问地址: http://localhost:3001"
    echo "?? 健康检查: http://localhost:3001/api/health"
    echo "?? 就绪检查: http://localhost:3001/api/ready"
    echo ""
    echo "?? 常用命令："
    echo "   查看日志: docker compose -f docker-compose.prod.yml logs -f api"
    echo "   停止服务: docker compose -f docker-compose.prod.yml down"
    echo "   重启服务: docker compose -f docker-compose.prod.yml restart api"
    exit 0
  fi
  echo "   等待中... ($i/30)"
  sleep 2
done

echo "? 服务启动超时，请检查日志："
echo "   docker compose -f docker-compose.prod.yml logs api"
exit 1