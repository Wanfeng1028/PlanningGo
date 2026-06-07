import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const cwd = process.cwd();
const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:3001";
const outDir = path.resolve(cwd, "dist/final-browser-demo");
const rawPath = path.resolve(cwd, "dist/planninggo-browser-full-demo-raw.webm");
const finalPath = path.resolve(cwd, "dist/planninggo-browser-full-demo.mp4");
const musicPath = path.resolve(cwd, "dist/planninggo-browser-bg-music.wav");
const checkPath = path.resolve(cwd, "dist/planninggo-browser-full-demo-check.png");
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureBackendReady() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("后端服务没有启动，停止录制。");
}

async function clickText(page, labels, wait = 900) {
  for (const label of Array.isArray(labels) ? labels : [labels]) {
    const role = page.getByRole("button", { name: label, exact: false }).first();
    if (await role.count().catch(() => 0)) {
      await role.click({ timeout: 4000 }).catch(() => {});
      await sleep(wait);
      return true;
    }
    const text = page.getByText(label, { exact: false }).first();
    if (await text.count().catch(() => 0)) {
      await text.click({ timeout: 4000 }).catch(() => {});
      await sleep(wait);
      return true;
    }
  }
  return false;
}

async function closeDialogs(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(250);
  for (const label of ["收到", "稍后联系", "知道了", "关闭"]) {
    const button = page.getByRole("button", { name: label, exact: false }).last();
    if (await button.count().catch(() => 0)) {
      await button.click({ timeout: 2500 }).catch(() => {});
      await sleep(400);
      return;
    }
  }
  const close = page.locator("button").filter({ hasText: /^×$|^X$/ }).last();
  if (await close.count().catch(() => 0)) {
    await close.click({ timeout: 2500 }).catch(() => {});
    await sleep(400);
  }
}

async function installCaption(page) {
  await page.addStyleTag({
    content: `
      #demo-caption-line {
        position: fixed;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        pointer-events: none;
        max-width: min(860px, calc(100vw - 260px));
        height: 30px;
        padding: 0 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(15, 23, 42, .76);
        color: #fff;
        border: 1px solid rgba(255,255,255,.18);
        box-shadow: 0 8px 24px rgba(15,23,42,.18);
        backdrop-filter: blur(10px);
        font: 700 13px/1.2 "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
        letter-spacing: 0;
        white-space: nowrap;
      }
    `,
  });
  await page.evaluate(() => {
    document.querySelector("#demo-caption-line")?.remove();
    const node = document.createElement("div");
    node.id = "demo-caption-line";
    document.body.appendChild(node);
    window.__demoCaption = (text) => {
      node.textContent = text;
    };
  });
}

async function caption(page, text) {
  await page.evaluate((value) => window.__demoCaption?.(value), text);
}

async function showDemoQr(page) {
  await page.evaluate(() => {
    document.querySelector("#demo-qr-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "demo-qr-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.22);backdrop-filter:blur(8px);";
    overlay.innerHTML = `
      <div style="width:420px;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 30px 80px rgba(15,23,42,.28);padding:28px;text-align:center;font-family:'Microsoft YaHei',system-ui,sans-serif;color:#111827;">
        <div style="font-size:28px;font-weight:800;margin-bottom:8px;">手机扫码继续</div>
        <div style="font-size:14px;color:#64748b;margin-bottom:18px;">电脑端生成短期二维码，手机扫码后继续查看当前规划</div>
        <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" style="display:block;margin:0 auto 16px;border:10px solid #fff;box-shadow:0 10px 30px rgba(15,23,42,.12);">
          <rect width="220" height="220" fill="#fff"/><rect x="18" y="18" width="54" height="54" fill="#111827"/><rect x="148" y="18" width="54" height="54" fill="#111827"/><rect x="18" y="148" width="54" height="54" fill="#111827"/><rect x="32" y="32" width="26" height="26" fill="#fff"/><rect x="162" y="32" width="26" height="26" fill="#fff"/><rect x="32" y="162" width="26" height="26" fill="#fff"/><g fill="#111827"><rect x="94" y="24" width="12" height="12"/><rect x="118" y="24" width="12" height="12"/><rect x="88" y="54" width="18" height="18"/><rect x="112" y="54" width="12" height="12"/><rect x="136" y="84" width="18" height="18"/><rect x="84" y="96" width="12" height="12"/><rect x="108" y="102" width="24" height="12"/><rect x="156" y="112" width="12" height="12"/><rect x="88" y="132" width="18" height="18"/><rect x="118" y="132" width="12" height="12"/><rect x="142" y="142" width="24" height="12"/><rect x="94" y="170" width="12" height="12"/><rect x="118" y="164" width="18" height="18"/><rect x="154" y="174" width="12" height="12"/><rect x="184" y="142" width="12" height="12"/><rect x="184" y="184" width="12" height="12"/></g>
        </svg>
        <div style="display:inline-flex;gap:8px;align-items:center;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;padding:8px 14px;">有效期 10 分钟 · PG2026</div>
      </div>`;
    document.body.appendChild(overlay);
  });
}

async function hideDemoQr(page) {
  await page.evaluate(() => document.querySelector("#demo-qr-overlay")?.remove());
}

async function buildDemoPlanResponse() {
  const prompt = "明天下午从西湖文化广场出发，先去 Manner Coffee 喝咖啡，再去海底捞吃晚饭，最后逛商场，朋友4人，预算人均300，需要生成可执行规划和下单预约草稿";
  const res = await fetch(`${API}/api/agent/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      city: "杭州",
      startPoint: "西湖文化广场",
      companions: "friends",
      budget: 300,
      modelMode: "flash",
      guestId: "video-demo",
    }),
  });
  if (!res.ok) throw new Error(`演示规划生成失败: ${res.status}`);
  const plan = await res.json();
  const conversationId = plan.conversationId ?? "11111111-1111-4111-8111-111111111111";
  return {
    type: "plan",
    content: "我已经把你的下午安排拆成可执行方案：咖啡集合、晚餐预约、商场散步和返程导航都准备好了。",
    conversationId,
    data: {
      planId: plan.planId,
      options: plan.options,
      summary: plan.summary,
      executableActions: plan.executableActions,
      planningActions: [
        { type: "navigation", label: "打开导航", provider: "open", origin: "西湖文化广场", destination: "Manner Coffee", mode: "walking" },
        { type: "calendar", label: "生成日历", title: "PlanningGo 周末计划", startTime: "2026-06-08T14:00:00+08:00" },
        { type: "mobile_handoff", label: "手机继续查看", conversationId, planId: plan.planId },
      ],
      conversationId,
    },
    metadata: { mode: "mock", fallbackUsed: false, traceId: "video_demo_trace" },
  };
}

async function installStableStream(page, agentResponse) {
  await page.route("**/api/agent/chat/stream", async (route) => {
    const now = new Date().toISOString();
    const events = [
      { id: "v1", type: "stage", stage: "understanding", label: "正在理解你的需求", status: "done", timestamp: now },
      { id: "v2", type: "stage", stage: "place_searching", label: "正在搜索地点和周边", status: "done", timestamp: now },
      { id: "v3", type: "stage", stage: "route_planning", label: "正在规划路线", status: "done", timestamp: now },
      { id: "v4", type: "stage", stage: "action_generating", label: "正在生成预约和导航动作", status: "done", timestamp: now },
    ];
    const lines = [];
    for (const event of events) lines.push(`data: ${JSON.stringify({ type: "agent_event", event })}\n\n`);
    lines.push(`data: ${JSON.stringify({ content: agentResponse.content })}\n\n`);
    lines.push(`data: [FINAL_RESULT]${JSON.stringify(agentResponse)}\n\n`);
    lines.push("data: [DONE]\n\n");
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      body: lines.join(""),
    });
  });
  await page.route("**/api/handoff/create", async (route) => {
    const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" fill="#fff"/><rect x="18" y="18" width="54" height="54" fill="#111827"/><rect x="148" y="18" width="54" height="54" fill="#111827"/><rect x="18" y="148" width="54" height="54" fill="#111827"/><rect x="32" y="32" width="26" height="26" fill="#fff"/><rect x="162" y="32" width="26" height="26" fill="#fff"/><rect x="32" y="162" width="26" height="26" fill="#fff"/><g fill="#111827"><rect x="94" y="24" width="12" height="12"/><rect x="118" y="24" width="12" height="12"/><rect x="88" y="54" width="18" height="18"/><rect x="112" y="54" width="12" height="12"/><rect x="136" y="84" width="18" height="18"/><rect x="84" y="96" width="12" height="12"/><rect x="108" y="102" width="24" height="12"/><rect x="156" y="112" width="12" height="12"/><rect x="88" y="132" width="18" height="18"/><rect x="118" y="132" width="12" height="12"/><rect x="142" y="142" width="24" height="12"/><rect x="94" y="170" width="12" height="12"/><rect x="118" y="164" width="18" height="18"/><rect x="154" y="174" width="12" height="12"/><rect x="184" y="142" width="12" height="12"/><rect x="184" y="184" width="12" height="12"/></g></svg>`;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        data: {
          code: "PG2026",
          continueUrl: `${BASE}/handoff/PG2026`,
          qrSvg,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      }),
    });
  });
}

async function login(page) {
  await caption(page, "登录小明测试账号，进入真实功能工作台");
  await clickText(page, "登录", 900);
  await page.locator("input[type='email']").first().fill("xiaoming@example.com");
  await page.locator("input[type='password']").first().fill("weekend123");
  await sleep(500);
  await clickText(page, "登录并继续", 1200);
  await page.getByText("小明同学", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(900);
}

async function recordRaw() {
  await ensureBackendReady();
  const agentResponse = await buildDemoPlanResponse();
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  await installStableStream(page, agentResponse);

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await installCaption(page);
  await caption(page, "首页：品牌、导航栏、定位、登录注册入口完整展示");
  await sleep(1800);
  await clickText(page, "定位", 800);

  await caption(page, "官网按钮逐个展示：开始试用、游客体验、了解功能、进入规划、联系我们");
  await clickText(page, "开始试用", 800);
  await closeDialogs(page);
  await clickText(page, "游客体验", 800);
  await closeDialogs(page);
  await clickText(page, "了解功能", 900);
  await clickText(page, "首页", 500);
  await clickText(page, "进入规划", 800);
  await closeDialogs(page);
  await clickText(page, ["返回首页", "首页"], 600);
  await clickText(page, "联系我们", 800);
  await closeDialogs(page);

  await caption(page, "导航栏稳定展示：首页、功能、场景案例、开发者、个人中心");
  await clickText(page, "功能", 1600);
  await clickText(page, "场景案例", 1500);
  await clickText(page, "开发者", 1500);
  await clickText(page, "个人中心", 1100);
  await closeDialogs(page);

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await installCaption(page);
  await login(page);

  await caption(page, "功能页：小明同学已登录，左侧聊天记录和功能入口可见");
  await page.locator("textarea").first().waitFor({ timeout: 20_000 });
  await sleep(1500);
  await clickText(page, "搜索记录", 700);
  await closeDialogs(page);
  await clickText(page, "地点灵感", 700);
  await closeDialogs(page);
  await clickText(page, "日程草稿", 700);
  await closeDialogs(page);
  await clickText(page, "收藏方案", 700);
  await closeDialogs(page);
  await clickText(page, "新建规划", 700);

  await caption(page, "对话输入需求：后端服务已启动，演示响应稳定生成");
  const prompt = "明天下午从西湖文化广场出发，先去 Manner Coffee 喝咖啡，再去海底捞吃晚饭，最后逛商场，朋友4人，预算人均300，需要生成可执行规划和下单预约草稿";
  const textarea = page.locator("textarea").first();
  await textarea.fill(prompt);
  await sleep(500);
  await clickText(page, "发送", 1100);
  await page.getByText("选这套方案", { exact: false }).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.getByText("选这套方案", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(4600);

  await caption(page, "规划结果：路线、预算、时间线、风险提示和可执行动作完整呈现");
  await page.mouse.wheel(0, 520);
  await sleep(1800);
  await clickText(page, "选这套方案", 1100);

  await caption(page, "执行闭环：预约建议、日历、保存、分享、导航入口");
  await clickText(page, "查看预约建议", 1300);
  await closeDialogs(page);
  await clickText(page, "生成日历", 800);
  await clickText(page, "保存方案", 800);
  await clickText(page, "分享", 900);
  await clickText(page, "打开导航", 800);

  await caption(page, "mock 下单预定：只生成草稿和确认信息，不发生真实支付");
  await clickText(page, ["美团", "预约", "团购", "复制"], 1500);

  await caption(page, "二维码接力：电脑生成二维码，手机扫码后继续查看当前规划");
  await clickText(page, "手机继续查看", 1200);
  await showDemoQr(page);
  await sleep(3200);
  await hideDemoQr(page);
  await closeDialogs(page);

  await caption(page, "地图闭环：开源地图真实显示，周边兴趣点、路线和图层切换可用");
  await clickText(page, "查看地图", 2600);
  await sleep(2400);
  await clickText(page, ["路线", "规划路线"], 1300);
  await clickText(page, ["卫星", "标准"], 1200);
  await clickText(page, ["返回", "返回功能"], 900);

  await caption(page, "场景案例页面：案例卡片和页面内容完整展示");
  await clickText(page, "场景案例", 1800);
  await page.mouse.wheel(0, 460);
  await sleep(1400);

  await caption(page, "开发者页面：API、沙箱、文档和集成能力展示");
  await clickText(page, "开发者", 1800);
  await closeDialogs(page);
  await page.mouse.wheel(0, 460);
  await sleep(1400);

  await caption(page, "个人中心：账号资料、偏好、权限和设置展示");
  await clickText(page, "个人中心", 1800);
  await closeDialogs(page);
  await page.mouse.wheel(0, 420);
  await sleep(1400);

  await caption(page, "顶部入口：小明同学与退出按钮展示，演示结束");
  await clickText(page, "小明同学", 800);
  await clickText(page, "退出", 1600);
  await sleep(800);

  const video = page.video();
  await context.close();
  await browser.close();
  const recorded = video ? await video.path() : "";
  if (!recorded || !fs.existsSync(recorded)) throw new Error("录屏文件没有生成");
  fs.copyFileSync(recorded, rawPath);
}

function writeMusicWav(file, seconds = 260) {
  const sampleRate = 48_000;
  const channels = 2;
  const total = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(total * channels * 2);
  const chords = [[261.63, 329.63, 392, 523.25], [220, 277.18, 329.63, 440], [196, 246.94, 293.66, 392], [174.61, 220, 261.63, 349.23]];
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const chord = chords[Math.floor(t / 4) % chords.length];
    const beat = Math.floor(t * 2);
    const arp = chord[beat % chord.length];
    const kickEnv = Math.exp(-((t * 2) % 1) * 18);
    const hatEnv = Math.exp(-((t * 8) % 1) * 32);
    const bass = Math.sin(2 * Math.PI * (chord[0] / 2) * t) * 0.10;
    const pad = chord.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t) * 0.030, 0);
    const lead = Math.sin(2 * Math.PI * arp * t) * 0.080 * (0.45 + 0.55 * Math.sin(Math.PI * ((t * 2) % 1)));
    const kick = Math.sin(2 * Math.PI * 72 * t) * 0.24 * kickEnv;
    const hat = (Math.sin(2 * Math.PI * 7600 * t) + Math.sin(2 * Math.PI * 9400 * t)) * 0.022 * hatEnv;
    const sample = Math.max(-0.95, Math.min(0.95, bass + pad + lead + kick + hat));
    const value = Math.round(sample * 32767);
    data.writeInt16LE(value, i * 4);
    data.writeInt16LE(value, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

function convertToMp4() {
  writeMusicWav(musicPath, 280);
  const ffmpeg = path.resolve(cwd, "node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe");
  if (!fs.existsSync(ffmpeg)) throw new Error(`没有找到 ffmpeg: ${ffmpeg}`);
  const filter = [
    "scale=1788:1005",
    "pad=1920:1080:66:75:color=0b0f19",
    "drawbox=x=66:y=20:w=1788:h=55:color=e5e7eb@1:t=fill",
    "drawbox=x=84:y=31:w=330:h=33:color=f8fafc@1:t=fill",
    "drawbox=x=435:y=32:w=1320:h=31:color=ffffff@1:t=fill",
    "drawbox=x=66:y=1074:w=1788:h=5:color=facc15@1:t=fill",
    "setsar=1",
  ].join(",");
  const args = [
    "-y",
    "-i", rawPath,
    "-stream_loop", "-1",
    "-i", musicPath,
    "-shortest",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-vf", filter,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    finalPath,
  ];
  const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

async function verifyVideo() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = `file:///${finalPath.replace(/\\/g, "/")}`;
  await page.setContent(`<video src="${url}" controls style="width:100%;height:100%;background:#111"></video>`);
  const info = await page.evaluate(async () => {
    const video = document.querySelector("video");
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      if (video.readyState >= 1) resolve();
    });
    video.currentTime = Math.min(12, Math.max(2, video.duration / 3));
    await new Promise((resolve) => { video.onseeked = resolve; });
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  });
  await page.screenshot({ path: checkPath, fullPage: false });
  await browser.close();
  return info;
}

await recordRaw();
convertToMp4();
console.log(JSON.stringify({ finalPath, rawPath, musicPath, checkPath }, null, 2));
process.exit(0);
