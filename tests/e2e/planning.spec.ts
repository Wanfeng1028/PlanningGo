/**
 * E2E 验收测试 — 周末去哪儿智能体
 *
 * 运行: npx playwright test
 * 前置: npm run dev 启动开发服务器
 */

import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test.describe("周末去哪儿 E2E 验收", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
  });

  test("A: 单人西湖咖啡火锅 — 完整流程", async ({ page }) => {
    // Step 1: Input test prompt
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("从杭师大仓前出发，明天上午9点，一个人，先找咖啡厅坐坐，中午吃火锅，预算200");
    await input.press("Enter");

    // Step 2: Wait for 3 plans to appear
    await page.waitForSelector('[class*="planCard"]', { timeout: 60000 });
    const planCards = page.locator('[class*="planCard"]');
    const planCount = await planCards.count();
    expect(planCount).toBeGreaterThanOrEqual(2);

    // Step 3: Check buttons have feedback
    const adjustBtn = page.locator('button:has-text("继续调整")').first();
    await expect(adjustBtn).toBeVisible();

    const calendarBtn = page.locator('button:has-text("生成日历")').first();
    await expect(calendarBtn).toBeVisible();

    const saveBtn = page.locator('button:has-text("保存方案")').first();
    await expect(saveBtn).toBeVisible();

    // Step 4: Click "继续调整"
    await adjustBtn.click();
    const textarea = page.locator('textarea').first();
    const value = await textarea.inputValue();
    expect(value).toContain("我想调整");
  });

  test("B: 朋友雨天杭州 — 室内偏好", async ({ page }) => {
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("明天杭州下雨，和朋友吃饭逛逛，预算300，少走路，别排队");
    await input.press("Enter");

    await page.waitForSelector('[class*="planCard"]', { timeout: 60000 });
    const planCards = page.locator('[class*="planCard"]');
    expect(await planCards.count()).toBeGreaterThanOrEqual(2);
  });

  test("C: 亲子半日 — 亲子友好", async ({ page }) => {
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("周末带娃半天，预算300，室内优先，别太累");
    await input.press("Enter");

    await page.waitForSelector('[class*="planCard"]', { timeout: 60000 });
  });

  test("D: 情侣约会 — 氛围餐厅", async ({ page }) => {
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("周六晚上和对象约会，想吃饭看电影，预算500，氛围好一点");
    await input.press("Enter");

    await page.waitForSelector('[class*="planCard"]', { timeout: 60000 });
  });
});
