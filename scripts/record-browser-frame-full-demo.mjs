import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const cwd = process.cwd();
const outDir = path.resolve(cwd, "dist/browser-full-demo");
fs.mkdirSync(outDir, { recursive: true });

const rawPath = path.resolve(cwd, "dist/planninggo-browser-full-demo-raw.webm");
const finalPath = path.resolve(cwd, "dist/planninggo-browser-full-demo.mp4");
const framePath = path.resolve(cwd, "dist/planninggo-browser-full-demo-check.png");

const BASE = "http://localhost:5173";
const API = "http://127.0.0.1:3001";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureBackendReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("后端服务没有启动或健康检查失败，停止录制。");
}

async function clickFirst(page, candidates, wait = 900) {
  for (const candidate of candidates) {
    const loc = typeof candidate === "string"
      ? page.getByText(candidate, { exact: false }).first()
      : candidate;
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 5000 }).catch(() => {});
      await sleep(wait);
      return true;
    }
  }
  return false;
}

async function clickNav(page, name, wait = 1200) {
  const exactButton = page.getByRole("button", { name, exact: true }).first();
  if (await exactButton.count().catch(() => 0)) {
    await exactButton.click({ timeout: 5000 }).catch(() => {});
    await sleep(wait);
    return true;
  }
  const exactText = page.getByText(name, { exact: true }).first();
  if (await exactText.count().catch(() => 0)) {
    await exactText.click({ timeout: 5000 }).catch(() => {});
    await sleep(wait);
    return true;
  }
  return clickFirst(page, [name], wait);
}

async function setCaption(page, text) {
  await page.evaluate((value) => window.__demoCaption?.(value), text);
}

async function installTopCaption(page) {
  await page.addStyleTag({
    content: `
      #demo-one-line-caption {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        pointer-events: none;
        max-width: min(920px, calc(100vw - 220px));
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 22px;
        border-radius: 999px;
        background: rgba(15, 23, 42, .78);
        color: #fff;
        border: 1px solid rgba(255,255,255,.18);
        box-shadow: 0 10px 34px rgba(15,23,42,.22);
        backdrop-filter: blur(10px);
        font: 700 16px/1.2 "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
        letter-spacing: 0;
        white-space: nowrap;
      }
    `,
  });
  await page.evaluate(() => {
    const node = document.createElement("div");
    node.id = "demo-one-line-caption";
    document.body.appendChild(node);
    window.__demoCaption = (text) => {
      node.textContent = text;
    };
  });
}

async function loginXiaoming(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await installTopCaption(page);
  await setCaption(page, "登录小明测试账号：xiaoming@example.com / weekend123");
  await clickFirst(page, ["登录"], 900);
  await page.locator("input[type='email']").first().fill("xiaoming@example.com");
  await page.locator("input[type='password']").first().fill("weekend123");
  await sleep(500);
  await clickFirst(page, ["登录并继续"]);
  await page.getByText("小明同学", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(1200);
}

async function recordRaw() {
  await ensureBackendReady();

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
  page.on("dialog", async (dialog) => {
    await sleep(500);
    await dialog.accept().catch(() => {});
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await installTopCaption(page);

  await setCaption(page, "首页：展示官网首屏、品牌、定位、小明同学与退出入口");
  await sleep(2200);
  await clickFirst(page, ["定位"], 900);
  await sleep(900);

  await setCaption(page, "首页按钮展示：开始试用、游客体验、了解功能、进入规划、联系我们");
  await clickFirst(page, ["开始试用"], 900);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);
  await clickFirst(page, ["游客体验"], 900);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);
  await clickFirst(page, ["了解功能"], 900);
  await clickNav(page, "首页", 600);
  await clickFirst(page, ["进入规划"], 1000);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);
  await clickFirst(page, ["返回首页"], 700);
  await clickFirst(page, ["联系我们"], 900);
  await clickNav(page, "首页", 900);

  await setCaption(page, "导航栏页面总览：功能、场景案例、开发者、个人中心都展示");
  await clickNav(page, "功能", 2200);
  await clickNav(page, "场景案例", 1600);
  await clickNav(page, "开发者", 1600);
  await clickNav(page, "个人中心", 1400);

  await loginXiaoming(page);

  await setCaption(page, "功能页左侧：小明账号已登录，历史聊天记录可见");
  await page.locator("textarea").first().waitFor({ timeout: 20_000 });
  await page.getByText("最近规划", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => {});
  await sleep(1600);

  await setCaption(page, "左侧功能入口：新建规划、搜索记录、地点灵感、日程草稿、收藏方案");
  await clickFirst(page, ["搜索记录"], 900);
  await clickFirst(page, ["地点灵感"], 900);
  await clickFirst(page, ["日程草稿"], 900);
  await clickFirst(page, ["收藏方案"], 900);
  await clickFirst(page, ["新建规划"], 900);

  await setCaption(page, "对话规划：输入需求，后端健康后生成真实 mock 规划");
  const prompt = "明天下午从西湖文化广场出发，先去 Manner Coffee 喝咖啡，再去海底捞吃晚饭，最后逛商场，朋友4人，预算人均300，需要生成可执行规划和下单预约草稿";
  const area = page.locator("textarea").first();
  await area.click().catch(() => {});
  await area.fill(prompt);
  await sleep(500);
  await clickFirst(page, ["发送"], 700);
  await page.getByText("选这套方案", { exact: false }).first().waitFor({ timeout: 50_000 }).catch(() => {});
  await sleep(2200);

  await setCaption(page, "规划结果：时间线、预算、风险、可执行入口都会展示");
  await page.mouse.wheel(0, 500);
  await sleep(1800);
  await clickFirst(page, ["选这套方案"], 900);

  await setCaption(page, "执行入口：预约建议、导航、日历、保存、分享、第三方 mock 操作");
  await clickFirst(page, ["查看预约建议"], 1900);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(600);
  await clickFirst(page, ["生成日历"], 900);
  await clickFirst(page, ["保存方案"], 900);
  await clickFirst(page, ["分享"], 900);
  await clickFirst(page, ["打开导航"], 900);

  await setCaption(page, "mock 下单预定：只生成草稿和确认提示，不真实付款");
  await clickFirst(page, ["查看美团", "预约", "团购", "复制"], 1700);

  await setCaption(page, "二维码接力：桌面生成短期二维码，手机扫码继续规划");
  await clickFirst(page, ["手机继续查看"], 1000);
  await page.getByText("手机扫码继续", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(3200);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(700);

  await setCaption(page, "地图闭环：开源地图真实瓦片、周边点位、路线、图层切换");
  await clickFirst(page, ["查看地图"], 2500);
  await sleep(2600);
  await clickFirst(page, ["杭州城市公园"], 700);
  await clickFirst(page, ["路线"], 1500);
  await clickFirst(page, ["卫星"], 1200);
  await clickFirst(page, ["标准"], 1000);
  await clickFirst(page, ["返回"], 900);

  await setCaption(page, "场景案例页面：展示不同使用场景和案例入口");
  await clickNav(page, "场景案例", 2200);
  await page.mouse.wheel(0, 450);
  await sleep(1600);

  await setCaption(page, "开发者页面：展示 API、文档、沙箱与开发者能力");
  await clickNav(page, "开发者", 2200);
  await page.mouse.wheel(0, 420);
  await sleep(1600);

  await setCaption(page, "个人中心：小明账号、画像、权限、设置与退出入口");
  await clickNav(page, "个人中心", 2200);
  await page.mouse.wheel(0, 420);
  await sleep(1600);
  await clickFirst(page, ["小明同学"], 900);

  await setCaption(page, "退出入口展示：完成全站页面与全流程演示");
  await clickFirst(page, ["退出"], 1800);
  await sleep(1600);

  const video = page.video();
  await context.close();
  await browser.close();
  const recorded = video ? await video.path() : "";
  if (!recorded || !fs.existsSync(recorded)) throw new Error("录屏文件没有生成");
  fs.copyFileSync(recorded, rawPath);
}

async function composeBrowserMp4() {
  const source = `data:video/webm;base64,${fs.readFileSync(rawPath).toString("base64")}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.exposeFunction("saveVideo", async (base64) => {
    fs.writeFileSync(finalPath, Buffer.from(base64, "base64"));
  });
  await page.setContent("<body style='margin:0;background:#0b0f19'></body>");
  await page.evaluate(async (src) => {
    const W = 1920;
    const H = 1080;
    const chromeH = 86;
    const margin = 26;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const duration = video.duration || 120;

    const audioCtx = new AudioContext();
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    const master = audioCtx.createGain();
    master.gain.value = 0.16;
    master.connect(dest);
    const notes = [261.63, 329.63, 392, 523.25, 440, 392, 349.23, 293.66];
    const startAt = audioCtx.currentTime + 0.05;
    for (let i = 0; i < Math.ceil(duration * 3.6); i += 1) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = i % 3 === 0 ? "triangle" : "sine";
      osc.frequency.value = notes[i % notes.length];
      const t = startAt + i * 0.28;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.24);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw() {
      ctx.fillStyle = "#080b13";
      ctx.fillRect(0, 0, W, H);

      roundRect(margin, margin, W - margin * 2, H - margin * 2, 18);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();

      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(margin, margin, W - margin * 2, chromeH);
      ctx.fillStyle = "#f8fafc";
      roundRect(margin + 18, margin + 14, 360, 40, 14);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.font = "600 18px Microsoft YaHei, sans-serif";
      ctx.fillText("PlanningGo 全站全流程演示", margin + 42, margin + 40);
      ctx.fillStyle = "#ffffff";
      roundRect(margin + 395, margin + 16, W - margin * 2 - 520, 36, 18);
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.font = "500 16px Microsoft YaHei, sans-serif";
      ctx.fillText("localhost:5173  /  小明同学已登录  /  后端服务已启动", margin + 430, margin + 40);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(W - 82, margin + 34, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath(); ctx.arc(W - 112, margin + 34, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(W - 142, margin + 34, 7, 0, Math.PI * 2); ctx.fill();

      const contentX = margin;
      const contentY = margin + chromeH;
      const contentW = W - margin * 2;
      const contentH = H - margin * 2 - chromeH;
      ctx.drawImage(video, contentX, contentY, contentW, contentH);

      ctx.fillStyle = "rgba(15,23,42,.34)";
      ctx.fillRect(contentX, H - margin - 5, contentW, 5);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(contentX, H - margin - 5, contentW * Math.min(1, video.currentTime / duration), 5);

      if (!video.ended) requestAnimationFrame(draw);
    }

    const stream = canvas.captureStream(30);
    const combined = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2")
      ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
      : "video/mp4";
    const recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 7_000_000,
      audioBitsPerSecond: 160_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      video.onended = () => setTimeout(() => recorder.stop(), 700);
      recorder.start(250);
      video.play();
      draw();
    });
    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    await window.saveVideo(btoa(binary));
  }, source);
  await browser.close();
}

async function verify() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = `file:///${finalPath.replace(/\\/g, "/")}`;
  await page.setContent(`<video src="${url}" controls style="width:100%;height:100%;background:#111"></video>`);
  const info = await page.evaluate(async () => {
    const v = document.querySelector("video");
    await new Promise((resolve, reject) => {
      v.onloadedmetadata = resolve;
      v.onerror = reject;
      if (v.readyState >= 1) resolve();
    });
    v.currentTime = Math.min(8, v.duration / 2);
    await new Promise((resolve) => { v.onseeked = resolve; });
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  });
  await page.screenshot({ path: framePath, fullPage: false });
  await browser.close();
  return info;
}

await recordRaw();
await composeBrowserMp4();
const info = await verify();
console.log(JSON.stringify({ rawPath, finalPath, framePath, info }, null, 2));
