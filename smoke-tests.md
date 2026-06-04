# PlanningGo Smoke Tests

## 运行方式

```bash
# 运行所有 smoke tests
npm run test:smoke

# 运行单个 smoke test
npm run test:smoke -- demo-scenarios
npm run test:smoke -- demo-mock-failures
npm run test:smoke -- demo-env-vars
```

---

## Smoke Test 1: Demo Scenarios

**目的**: 验证 demoScenarios.ts 数据文件正确，3 个场景都有完整数据。

```bash
node --experimental-vm-modules --loader ts-node/esm -e "
import { demoScenarios } from './src/data/demoScenarios.ts';

console.log('=== Smoke Test: Demo Scenarios ===');
console.log('场景数量:', demoScenarios.length);

const requiredFields = ['id', 'title', 'desc', 'prompt', 'icon', 'city'];
const expectedIds = ['family-weekend', 'couple-date', 'friends-gathering'];

let passed = 0;
let failed = 0;

for (const scenario of demoScenarios) {
  const hasAllFields = requiredFields.every(f => scenario[f] != null);
  const hasExpectedId = expectedIds.includes(scenario.id);
  
  if (hasAllFields && hasExpectedId) {
    console.log('✓', scenario.id, '-', scenario.title);
    passed++;
  } else {
    console.log('✗', scenario.id, '- 数据不完整或 ID 不匹配');
    failed++;
  }
}

console.log('');
console.log('结果:', passed, '通过,', failed, '失败');
process.exit(failed > 0 ? 1 : 0);
"
```

---

## Smoke Test 2: Mock Booking Failures

**目的**: 验证 MOCK_BOOKING_FAILURES 环境变量正确解析，candidateGenerator 中的 bookingAvailable 逻辑生效。

```bash
# 测试 no_seat 失败
MOCK_BOOKING_FAILURES=no_seat node --experimental-vm-modules --loader ts-node/esm -e "
import { env } from './src/server/config/env.ts';
import { resolveBookingAvailable } from './src/server/modules/planning/candidateGenerator.ts';

console.log('=== Smoke Test: Mock Booking Failures (no_seat) ===');
console.log('MOCK_BOOKING_FAILURES:', env.MOCK_BOOKING_FAILURES);

// 验证 no_seat 被正确解析
if (env.MOCK_BOOKING_FAILURES.includes('no_seat')) {
  console.log('✓ no_seat 已启用');
} else {
  console.log('✗ no_seat 未正确解析');
  process.exit(1);
}

// 验证 restaurant 的 bookingAvailable 为 false
const result = resolveBookingAvailable('restaurant', '海底捞');
if (!result.bookingAvailable && result.queueRisk === 'high') {
  console.log('✓ 餐厅 bookingAvailable=false, queueRisk=high');
} else {
  console.log('✗ 餐厅 bookingAvailable 逻辑不正确');
  process.exit(1);
}

console.log('');
console.log('结果: 通过');
"
```

```bash
# 测试 no_ticket 失败
MOCK_BOOKING_FAILURES=no_ticket node --experimental-vm-modules --loader ts-node/esm -e "
import { env } from './src/server/config/env.ts';
import { resolveBookingAvailable } from './src/server/modules/planning/candidateGenerator.ts';

console.log('=== Smoke Test: Mock Booking Failures (no_ticket) ===');

if (env.MOCK_BOOKING_FAILURES.includes('no_ticket')) {
  console.log('✓ no_ticket 已启用');
} else {
  console.log('✗ no_ticket 未正确解析');
  process.exit(1);
}

const result = resolveBookingAvailable('scenic', '西湖');
if (!result.bookingAvailable && result.queueRisk === 'high') {
  console.log('✓ 景点 bookingAvailable=false, queueRisk=high');
} else {
  console.log('✗ 景点 bookingAvailable 逻辑不正确');
  process.exit(1);
}

console.log('');
console.log('结果: 通过');
"
```

---

## Smoke Test 3: Environment Variables

**目的**: 验证 DEMO_MODE、MOCK_BOOKING_FAILURES、MOCK_LATENCY_MS 环境变量正确解析。

```bash
DEMO_MODE=true MOCK_BOOKING_FAILURES=no_seat,no_ticket MOCK_LATENCY_MS=500 node --experimental-vm-modules --loader ts-node/esm -e "
import { env } from './src/server/config/env.ts';

console.log('=== Smoke Test: Environment Variables ===');

let passed = 0;
let failed = 0;

// DEMO_MODE
if (env.DEMO_MODE === true) {
  console.log('✓ DEMO_MODE=true');
  passed++;
} else {
  console.log('✗ DEMO_MODE 应为 true，实际:', env.DEMO_MODE);
  failed++;
}

// MOCK_BOOKING_FAILURES
if (env.MOCK_BOOKING_FAILURES.includes('no_seat') && env.MOCK_BOOKING_FAILURES.includes('no_ticket')) {
  console.log('✓ MOCK_BOOKING_FAILURES=[no_seat, no_ticket]');
  passed++;
} else {
  console.log('✗ MOCK_BOOKING_FAILURES 解析不正确，实际:', env.MOCK_BOOKING_FAILURES);
  failed++;
}

// MOCK_LATENCY_MS
if (env.MOCK_LATENCY_MS === 500) {
  console.log('✓ MOCK_LATENCY_MS=500');
  passed++;
} else {
  console.log('✗ MOCK_LATENCY_MS 应为 500，实际:', env.MOCK_LATENCY_MS);
  failed++;
}

console.log('');
console.log('结果:', passed, '通过,', failed, '失败');
process.exit(failed > 0 ? 1 : 0);
"
```

---

## Smoke Test 4: API Types

**目的**: 验证 PlanningOption 接口包含 constraints 字段。

```bash
node --experimental-vm-modules --loader ts-node/esm -e "
import type { PlanningOption } from './src/lib/api.ts';

console.log('=== Smoke Test: API Types ===');

// 验证 PlanningOption 可以包含 constraints 字段
const plan: PlanningOption = {
  id: 'test',
  planId: 'test',
  title: '测试方案',
  targetGroup: '家庭',
  score: 95,
  summary: '测试',
  totalDurationMinutes: 180,
  totalCostMin: 200,
  totalCostMax: 500,
  assumptions: [],
  highlights: [],
  risks: [],
  timeline: [],
  constraints: ['👨‍👩‍👧 亲子友好', '💰 预算 200-500'],
};

if (plan.constraints && plan.constraints.length === 2) {
  console.log('✓ PlanningOption.constraints 字段正确');
  console.log('  约束标签:', plan.constraints.join(', '));
} else {
  console.log('✗ PlanningOption.constraints 字段不正确');
  process.exit(1);
}

console.log('');
console.log('结果: 通过');
"
```

---

## Smoke Test 5: Build Verification

**目的**: 验证所有修改的文件都能通过 TypeScript 编译。

```bash
npm run build 2>&1 | grep -E "(error|built in)"
```

预期输出：
- 无 TypeScript 错误
- 包含 "built in" 表示构建成功
