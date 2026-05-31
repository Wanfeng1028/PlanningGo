# scripts/deploy.ps1 — PlanningGo 一键部署脚本 (Windows)
# 用法: pwsh scripts/deploy.ps1

Write-Host "? PlanningGo 部署脚本" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# 1. 检查 .env.production
if (-not (Test-Path ".env.production")) {
    Write-Host "? 未找到 .env.production" -ForegroundColor Red
    Write-Host "   正在从模板创建..." -ForegroundColor Yellow
    Copy-Item ".env.production.template" ".env.production"
    Write-Host "   ?? 请编辑 .env.production 填入必填项" -ForegroundColor Yellow
    Write-Host "      生成密钥: openssl rand -hex 32" -ForegroundColor Gray
    exit 1
}

# 2. 构建并启动
Write-Host ""
Write-Host "?? 构建并启动服务..." -ForegroundColor Green
docker compose -f docker-compose.prod.yml up -d --build

# 3. 等待健康检查
Write-Host ""
Write-Host "? 等待服务就绪..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "? 服务已就绪！" -ForegroundColor Green
            Write-Host ""
            Write-Host "?? 访问地址: http://localhost:3001" -ForegroundColor Cyan
            Write-Host "?? 就绪检查: http://localhost:3001/api/ready" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "?? 常用命令:" -ForegroundColor Gray
            Write-Host "   查看日志: docker compose -f docker-compose.prod.yml logs -f api" -ForegroundColor Gray
            Write-Host "   停止服务: docker compose -f docker-compose.prod.yml down" -ForegroundColor Gray
            exit 0
        }
    } catch {
        Write-Host "   等待中... ($i/30)" -ForegroundColor Gray
    }
    Start-Sleep -Seconds 2
}

Write-Host "? 服务启动超时，请检查日志" -ForegroundColor Red
Write-Host "   docker compose -f docker-compose.prod.yml logs api" -ForegroundColor Gray
exit 1