import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const cwd = process.cwd();
const outDir = path.resolve(cwd, "dist/full-demo");
fs.mkdirSync(outDir, { recursive: true });

const rawPath = path.resolve(cwd, "dist/planninggo-full-system-demo-raw.webm");
const finalPath = path.resolve(cwd, "dist/planninggo-full-system-demo.mp4");
const finalFramePath = path.resolve(cwd, "dist/planninggo-full-system-demo-check.png");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickText(page, text, options = {}) {
  const locator = page.getByText(text, { exact: options.exact ?? false }).first();
  if (await locator.count()) {
    await locator.click({ timeout: options.timeout ?? 5000 }).catch(() => {});
    return true;
  }
  return false;
}

async function setCaption(page, title, text) {
  await page.evaluate(({ title, text }) => {
    window.__demoCaption?.(title, text);
  }, { title, text });
}

async function installCaptionOverlay(page) {
  await page.addStyleTag({
    content: `
      #planninggo-demo-caption {
        position: fixed;
        left: 38px;
        right: 38px;
        bottom: 28px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
      }
      #planninggo-demo-caption .caption-card {
        width: min(980px, calc(100vw - 76px));
        border-radius: 18px;
        padding: 20px 24px 18px;
        color: white;
        background: linear-gradient(135deg, rgba(15,23,42,.92), rgba(17,24,39,.78));
        border: 1px solid rgba(255,255,255,.22);
        box-shadow: 0 20px 70px rgba(0,0,0,.34);
        backdrop-filter: blur(10px);
      }
      #planninggo-demo-caption .caption-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(56,189,248,.18);
        color: #bae6fd;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      #planninggo-demo-caption .caption-title {
        font-size: 27px;
        line-height: 1.18;
        font-weight: 800;
        letter-spacing: 0;
      }
      #planninggo-demo-caption .caption-text {
        margin-top: 8px;
        font-size: 18px;
        line-height: 1.5;
        color: rgba(255,255,255,.84);
      }
      #planninggo-demo-topbar {
        position: fixed;
        left: 38px;
        top: 24px;
        z-index: 2147483647;
        pointer-events: none;
        height: 44px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 0 18px;
        border-radius: 999px;
        color: #fff;
        background: rgba(15,23,42,.7);
        border: 1px solid rgba(255,255,255,.16);
        backdrop-filter: blur(10px);
        font-family: "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
        font-weight: 800;
        box-shadow: 0 12px 42px rgba(0,0,0,.22);
      }
      #planninggo-demo-topbar span {
        color: #67e8f9;
      }
    `,
  });
  await page.evaluate(() => {
    const topbar = document.createElement("div");
    topbar.id = "planninggo-demo-topbar";
    topbar.innerHTML = "<span>PlanningGo</span> mock 全流程演示";
    document.body.appendChild(topbar);

    const root = document.createElement("div");
    root.id = "planninggo-demo-caption";
    root.innerHTML = `
      <div class="caption-card">
        <div class="caption-kicker">系统演示</div>
        <div class="caption-title"></div>
        <div class="caption-text"></div>
      </div>
    `;
    document.body.appendChild(root);

    window.__demoCaption = (title, text) => {
      root.querySelector(".caption-title").textContent = title;
      root.querySelector(".caption-text").textContent = text;
    };
  });
}

async function recordRawDemo() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: { dir: outDir, size: { width: 1366, height: 768 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on("dialog", async (dialog) => {
    await sleep(700);
    await dialog.accept().catch(() => {});
  });

  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await installCaptionOverlay(page);

  await setCaption(page, "从首页启动系统", "先展示产品首页和顶部导航，说明这是一个完整的周末规划助手。");
  await sleep(2600);

  await setCaption(page, "导航栏页面总览", "依次进入功能、场景案例、开发者和个人中心，把主导航页面都走一遍。");
  await clickText(page, "功能", { exact: true });
  await sleep(1600);
  await clickText(page, "场景案例", { exact: true });
  await sleep(1700);
  await clickText(page, "开发者", { exact: true });
  await sleep(1700);
  await clickText(page, "个人中心", { exact: true });
  await sleep(1400);

  await setCaption(page, "登录入口与游客体验", "展示登录入口；演示环境使用游客登录，等同 mock 账号快速进入完整功能。");
  await clickText(page, "游客", { exact: true });
  await sleep(700);
  await clickText(page, "杭州", { exact: true });
  await sleep(500);
  await clickText(page, "朋友聚会", { exact: false });
  await sleep(500);
  await clickText(page, "以游客身份开始体验", { exact: false });
  await sleep(2600);

  await setCaption(page, "进入规划工作台", "左侧是历史记录和工具区，中间是对话流，底部输入需求即可生成计划。");
  await sleep(1800);

  const prompt = "明天下午从西湖文化广场出发，先去 Manner Coffee 喝咖啡，再去海底捞吃晚饭，最后逛商场，朋友4人，预算人均300，需要生成可执行规划和下单预约草稿";
  await setCaption(page, "发起自然语言对话", "用户只需要说清楚时间、出发地、人数、预算和偏好，系统会自动补成结构化规划。");
  const textarea = page.locator("textarea").first();
  await textarea.click().catch(() => {});
  await textarea.fill(prompt);
  await sleep(900);
  await clickText(page, "发送", { exact: true });

  await setCaption(page, "AI 规划生成中", "后端会做意图解析、地点搜索、路线安排、预算和执行动作生成。");
  await page.getByText("选这套方案", { exact: false }).first().waitFor({ timeout: 45_000 }).catch(() => {});
  await sleep(2000);

  await setCaption(page, "规划卡片", "方案卡片展示时间线、地点、预算、风险提示和可执行入口。");
  await page.mouse.wheel(0, 520);
  await sleep(2000);

  await setCaption(page, "选择方案并执行", "可以选择一套方案，再进入预约建议、导航、日历和第三方服务动作。");
  await clickText(page, "选这套方案", { exact: false });
  await sleep(1200);
  await clickText(page, "查看预约建议", { exact: false });
  await sleep(2000);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(700);

  await setCaption(page, "mock 预定 / 下单闭环", "演示环境不会真实支付，只生成预约或下单草稿，并提示去第三方平台最终确认。");
  await clickText(page, "查看美团", { exact: false }) ||
    await clickText(page, "预约", { exact: false }) ||
    await clickText(page, "下单草稿", { exact: false }) ||
    await clickText(page, "点单草稿", { exact: false });
  await sleep(2200);

  await setCaption(page, "二维码接力", "桌面端生成短期二维码，手机扫码后可以继续查看和导航当前规划。");
  await clickText(page, "手机继续查看", { exact: false });
  await page.getByText("手机扫码继续", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(3500);
  await page.keyboard.press("Escape").catch(() => {});
  await clickText(page, "关闭", { exact: false }).catch(() => {});
  await sleep(800);

  await setCaption(page, "地图闭环", "未配置高德 Key 时自动使用开源地图；真实瓦片、周边点位和路线入口都可用。");
  await clickText(page, "查看地图", { exact: false });
  await sleep(4300);
  await clickText(page, "杭州城市公园", { exact: false }).catch(() => {});
  await sleep(900);
  await clickText(page, "路线", { exact: false }).catch(() => {});
  await sleep(2200);
  await clickText(page, "卫星", { exact: true }).catch(() => {});
  await sleep(1600);
  await clickText(page, "标准", { exact: true }).catch(() => {});
  await sleep(1500);

  await setCaption(page, "完整 mock 作品演示完成", "导航页、登录、对话、规划、执行、二维码接力和地图闭环已经完整串起来。");
  await sleep(3000);

  const video = page.video();
  await context.close();
  await browser.close();

  const recorded = video ? await video.path() : "";
  if (!recorded || !fs.existsSync(recorded)) throw new Error("Raw video was not recorded");
  fs.copyFileSync(recorded, rawPath);
  return rawPath;
}

async function composeMp4(sourcePath) {
  const videoDataUrl = `data:video/webm;base64,${fs.readFileSync(sourcePath).toString("base64")}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.exposeFunction("saveFullDemoVideo", async (base64) => {
    fs.writeFileSync(finalPath, Buffer.from(base64, "base64"));
  });
  await page.setContent("<!doctype html><html><body style='margin:0;background:#111'></body></html>");
  await page.evaluate(async (src) => {
    const width = 1366;
    const height = 768;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("video load failed"));
    });
    const duration = video.duration || 70;

    const audioCtx = new AudioContext();
    await audioCtx.resume();
    const destination = audioCtx.createMediaStreamDestination();
    const master = audioCtx.createGain();
    master.gain.value = 0.045;
    master.connect(destination);
    const notes = [261.63, 329.63, 392, 523.25, 493.88, 392, 349.23, 440];
    const startAt = audioCtx.currentTime + 0.08;
    for (let i = 0; i < Math.ceil(duration * 3.2); i += 1) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = i % 5 === 0 ? "triangle" : "sine";
      osc.frequency.value = notes[i % notes.length];
      const t = startAt + i * 0.31;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.28);
    }

    const draw = () => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(video, 0, 0, width, height);
      const progress = Math.min(1, video.currentTime / duration);
      ctx.fillStyle = "rgba(15,23,42,.34)";
      ctx.fillRect(0, height - 5, width, 5);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(0, height - 5, width * progress, 5);
      if (!video.ended) requestAnimationFrame(draw);
    };

    const stream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...stream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2")
      ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
      : "video/mp4";
    const recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 5_500_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      video.onended = () => setTimeout(() => recorder.stop(), 650);
      recorder.start(250);
      video.play();
      draw();
    });
    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    await window.saveFullDemoVideo(btoa(binary));
  }, videoDataUrl);

  await browser.close();
}

async function verifyMp4() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const fileUrl = `file:///${finalPath.replace(/\\/g, "/")}`;
  await page.setContent(`<video src="${fileUrl}" controls style="width:100%;height:100%;background:#111"></video>`);
  const metadata = await page.evaluate(async () => {
    const video = document.querySelector("video");
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("final video load failed"));
      if (video.readyState >= 1) resolve();
    });
    video.currentTime = Math.min(5, video.duration / 2);
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  });
  await page.screenshot({ path: finalFramePath, fullPage: false });
  await browser.close();
  return metadata;
}

const raw = await recordRawDemo();
await composeMp4(raw);
const metadata = await verifyMp4();
console.log(JSON.stringify({ rawPath, finalPath, finalFramePath, metadata }, null, 2));
