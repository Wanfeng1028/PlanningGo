#!/usr/bin/env pwsh
# scripts/smoke-prod.ps1 — 生产环境冒烟测试
# Usage: .\scripts\smoke-prod.ps1 [-BaseUrl http://localhost:3001]

param(
    [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"
$pass = 0
$fail = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [int]$ExpectedStatus,
        [string]$Body = $null,
        [hashtable]$Headers = @{}
    )

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
            TimeoutSec = 10
            UseBasicParsing = $true
        }

        if ($Body) {
            $params.Body = $Body
        }

        $response = Invoke-WebRequest @params

        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host "  ✅ $Name ($($response.StatusCode))" -ForegroundColor Green
            $script:pass++
            return $response.Content | ConvertFrom-Json
        } else {
            Write-Host "  ❌ $Name — expected $ExpectedStatus, got $($response.StatusCode)" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ✅ $Name ($statusCode)" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "  ❌ $Name — expected $ExpectedStatus, got $statusCode" -ForegroundColor Red
            $script:fail++
        }
    }
}

Write-Host "`n🔍 PlanningGo 生产环境冒烟测试" -ForegroundColor Cyan
Write-Host "   目标: $BaseUrl`n" -ForegroundColor Gray

# ── 1. Health Check ──
Write-Host "── Health ──" -ForegroundColor Yellow
Test-Endpoint -Name "GET /api/health" -Method GET -Url "$BaseUrl/api/health" -ExpectedStatus 200

# ── 2. Auth — Demo 应被禁用 ──
Write-Host "`n── Auth (Demo Disabled) ──" -ForegroundColor Yellow
Test-Endpoint -Name "POST /api/auth/demo → 404" -Method POST -Url "$BaseUrl/api/auth/demo" -ExpectedStatus 404 -Body '{}' 

# ── 3. Auth — Register (缺少字段应报错) ──
Write-Host "`n── Auth (Register Validation) ──" -ForegroundColor Yellow
Test-Endpoint -Name "POST /api/auth/register (空 body) → 400" -Method POST -Url "$BaseUrl/api/auth/register" -ExpectedStatus 400 -Body '{}'

# ── 4. Agent — Plan (无 auth 也可用 optionalAuthGuard) ──
Write-Host "`n── Agent (Planning) ──" -ForegroundColor Yellow
Test-Endpoint -Name "POST /api/agent/parse" -Method POST -Url "$BaseUrl/api/agent/parse" -ExpectedStatus 400 -Body '{}'

# ── 5. Actions — 无 auth 应返回 401 ──
Write-Host "`n── Actions (Auth Required) ──" -ForegroundColor Yellow
Test-Endpoint -Name "GET /api/actions → 401" -Method GET -Url "$BaseUrl/api/actions" -ExpectedStatus 401
Test-Endpoint -Name "POST /api/actions/quote → 401" -Method POST -Url "$BaseUrl/api/actions/quote" -ExpectedStatus 401 -Body '{}'

# ── 6. 不应存在的路由 ──
Write-Host "`n── Unknown Routes ──" -ForegroundColor Yellow
Test-Endpoint -Name "GET /api/nonexistent → 404" -Method GET -Url "$BaseUrl/api/nonexistent" -ExpectedStatus 404

# ── 结果 ──
Write-Host "`n═══════════════════════════════════" -ForegroundColor Cyan
$total = $pass + $fail
Write-Host "  结果: $pass/$total 通过" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })

if ($fail -gt 0) {
    Write-Host "  ⚠️ $fail 项测试失败" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  🎉 全部通过!" -ForegroundColor Green
    exit 0
}
