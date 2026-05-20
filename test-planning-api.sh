#!/bin/bash

# 测试规划 API 返回的数据结构

API_BASE="http://127.0.0.1:3003"

echo "=== 测试规划 API ==="
echo ""
echo "请求: POST /api/agent/plan"
echo "URL: $API_BASE/api/agent/plan"
echo ""

curl -X POST "$API_BASE/api/agent/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "明天带娃半天，预算 300，想玩点不一样的",
    "city": "杭州",
    "companions": "family"
  }' \
  -s | jq '.' 2>/dev/null || echo "请确保后端已启动在 $API_BASE"

echo ""
echo "=== 检查返回数据结构 ==="
echo "应该包含以下字段:"
echo "  - traceId: string"
echo "  - planId: string"
echo "  - summary: string"
echo "  - selectedPlanId: string"
echo "  - options: ActivityPlan[]"
echo "  - executableActions: ExecutionAction[]"
echo "  - nextActions: string[]"
