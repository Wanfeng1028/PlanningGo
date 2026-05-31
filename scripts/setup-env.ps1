# scripts/setup-env.ps1 — PlanningGo 环境配置向导
# 用法: pwsh scripts/setup-env.ps1

Write-Host ""
Write-Host "?? PlanningGo 环境配置向导" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# 检查 .env 是否存在
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "? .env 不存在，从 .env.example 创建..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
    } else {
        Write-Host "? .env 和 .env.example 都不存在" -ForegroundColor Red
        exit 1
    }
}

$content = Get-Content ".env" -Raw -Encoding utf8

# 1. 选择 LLM 服务
Write-Host ""
Write-Host "?? 选择 LLM 服务:" -ForegroundColor Yellow
Write-Host "  1) DeepSeek (推荐，¥1/百万token)" -ForegroundColor White
Write-Host "  2) 通义千问 (阿里云，免费额度)" -ForegroundColor White
Write-Host "  3) 智谱 GLM (免费额度)" -ForegroundColor White
Write-Host "  4) OpenAI (国际，`$0.15/百万token)" -ForegroundColor White
Write-Host "  5) 本地 Ollama (零成本)" -ForegroundColor White
Write-Host "  6) 跳过" -ForegroundColor Gray

$choice = Read-Host "请选择 [1-6]"

switch ($choice) {
    "1" {
        $apiKey = Read-Host "DeepSeek API Key (从 https://platform.deepseek.com/ 获取)"
        if ($apiKey) {
            $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=$apiKey"
            $content = $content -replace 'OPENAI_BASE_URL=.*', "OPENAI_BASE_URL=https://api.deepseek.com/v1"
            $content = $content -replace 'LLM_MODEL=.*', "LLM_MODEL=deepseek-chat"
            $content = $content -replace 'LLM_FLASH_MODEL=.*', "LLM_FLASH_MODEL=deepseek-chat"
            $content = $content -replace 'LLM_PRO_MODEL=.*', "LLM_PRO_MODEL=deepseek-chat"
            Write-Host "? DeepSeek 配置完成" -ForegroundColor Green
        }
    }
    "2" {
        $apiKey = Read-Host "通义千问 API Key (从 https://dashscope.console.aliyun.com/ 获取)"
        if ($apiKey) {
            $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=$apiKey"
            $content = $content -replace 'OPENAI_BASE_URL=.*', "OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1"
            $content = $content -replace 'LLM_MODEL=.*', "LLM_MODEL=qwen-turbo"
            $content = $content -replace 'LLM_FLASH_MODEL=.*', "LLM_FLASH_MODEL=qwen-turbo"
            $content = $content -replace 'LLM_PRO_MODEL=.*', "LLM_PRO_MODEL=qwen-plus"
            Write-Host "? 通义千问配置完成" -ForegroundColor Green
        }
    }
    "3" {
        $apiKey = Read-Host "智谱 API Key (从 https://open.bigmodel.cn/ 获取)"
        if ($apiKey) {
            $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=$apiKey"
            $content = $content -replace 'OPENAI_BASE_URL=.*', "OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4"
            $content = $content -replace 'LLM_MODEL=.*', "LLM_MODEL=glm-4-flash"
            $content = $content -replace 'LLM_FLASH_MODEL=.*', "LLM_FLASH_MODEL=glm-4-flash"
            $content = $content -replace 'LLM_PRO_MODEL=.*', "LLM_PRO_MODEL=glm-4"
            Write-Host "? 智谱 GLM 配置完成" -ForegroundColor Green
        }
    }
    "4" {
        $apiKey = Read-Host "OpenAI API Key (从 https://platform.openai.com/ 获取)"
        if ($apiKey) {
            $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=$apiKey"
            $content = $content -replace 'OPENAI_BASE_URL=.*', "OPENAI_BASE_URL=https://api.openai.com/v1"
            $content = $content -replace 'LLM_MODEL=.*', "LLM_MODEL=gpt-4o-mini"
            $content = $content -replace 'LLM_FLASH_MODEL=.*', "LLM_FLASH_MODEL=gpt-4o-mini"
            $content = $content -replace 'LLM_PRO_MODEL=.*', "LLM_PRO_MODEL=gpt-4o"
            Write-Host "? OpenAI 配置完成" -ForegroundColor Green
        }
    }
    "5" {
        $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=ollama"
        $content = $content -replace 'OPENAI_BASE_URL=.*', "OPENAI_BASE_URL=http://localhost:11434/v1"
        $content = $content -replace 'LLM_MODEL=.*', "LLM_MODEL=qwen2.5:7b"
        $content = $content -replace 'LLM_FLASH_MODEL=.*', "LLM_FLASH_MODEL=qwen2.5:7b"
        $content = $content -replace 'LLM_PRO_MODEL=.*', "LLM_PRO_MODEL=qwen2.5:14b"
        Write-Host "? Ollama 配置完成" -ForegroundColor Green
        Write-Host "   确保 Ollama 已运行: ollama serve" -ForegroundColor Gray
    }
    default {
        Write-Host "?? 跳过 LLM 配置" -ForegroundColor Gray
    }
}

# 2. 高德地图 Key
Write-Host ""
Write-Host "?? 高德地图 API Key:" -ForegroundColor Yellow
Write-Host "  从 https://console.amap.com/dev/key/app 获取（免费）" -ForegroundColor Gray
$amapKey = Read-Host "高德 Key (回车跳过)"
if ($amapKey) {
    $content = $content -replace 'AMAP_WEB_SERVICE_KEY=.*', "AMAP_WEB_SERVICE_KEY=$amapKey"
    Write-Host "? 高德地图配置完成" -ForegroundColor Green
}

# 3. 切换规划模式
$llmConfigured = $content -match 'OPENAI_API_KEY=.+'
if ($llmConfigured) {
    Write-Host ""
    Write-Host "?? 切换规划模式:" -ForegroundColor Yellow
    Write-Host "  1) hybrid (推荐，LLM 优先 + mock 兜底)" -ForegroundColor White
    Write-Host "  2) llm (纯 LLM，失败报错)" -ForegroundColor White
    Write-Host "  3) 保持 mock" -ForegroundColor Gray
    $modeChoice = Read-Host "请选择 [1-3]"
    switch ($modeChoice) {
        "1" {
            $content = $content -replace 'PLANNING_MODE=.*', "PLANNING_MODE=hybrid"
            Write-Host "? 已切换到 hybrid 模式" -ForegroundColor Green
        }
        "2" {
            $content = $content -replace 'PLANNING_MODE=.*', "PLANNING_MODE=llm"
            Write-Host "? 已切换到 llm 模式" -ForegroundColor Green
        }
        default {
            Write-Host "?? 保持 mock 模式" -ForegroundColor Gray
        }
    }
}

# 保存
Set-Content ".env" $content -Encoding utf8 -NoNewline

# 总结
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "?? 配置已保存到 .env" -ForegroundColor Green
Write-Host ""
Write-Host "?? 启动命令:" -ForegroundColor Yellow
Write-Host "   终端1: npm run dev:api" -ForegroundColor White
Write-Host "   终端2: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "?? 验证 LLM 调用:" -ForegroundColor Yellow
Write-Host '   curl -X POST http://127.0.0.1:3001/api/agent/plan/stream \' -ForegroundColor Gray
Write-Host '     -H "Content-Type: application/json" \' -ForegroundColor Gray
Write-Host '     -d ''{"prompt":"周末带娃半天","city":"上海","modelMode":"flash"}''' -ForegroundColor Gray
Write-Host ""