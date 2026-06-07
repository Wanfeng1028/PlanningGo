import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const cwd = process.cwd();
const inputPath = path.resolve(cwd, "dist/planninggo-mock-map-demo.webm");
const outputPath = path.resolve(cwd, "dist/planninggo-mock-map-demo-captioned.webm");

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input video not found: ${inputPath}`);
}

const videoDataUrl = `data:video/webm;base64,${fs.readFileSync(inputPath).toString("base64")}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(120_000);

await page.exposeFunction("saveCaptionedVideo", async (base64) => {
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
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
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load source video"));
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 24;
  const captions = [
    { start: 0, end: 3.4, title: "PlanningGo Mock 演示", text: "进入功能工作台，使用游客态快速体验完整规划流程" },
    { start: 3.4, end: 7.4, title: "开源地图自动启用", text: "未配置高德 Key 时，系统默认展示开源地图服务" },
    { start: 7.4, end: 11.4, title: "真实地图瓦片", text: "OpenStreetMap 瓦片稳定加载，桌面布局铺满主视图" },
    { start: 11.4, end: 15.4, title: "周边兴趣点", text: "POI 面板可刷新、点击定位，也能在服务不可用时给出演示兜底" },
    { start: 15.4, end: 19.4, title: "路线与图层", text: "支持路线入口、标准图层和卫星图层切换" },
    { start: 19.4, end: 999, title: "交付状态", text: "地图闭环、按钮状态和移动/桌面适配已经打通" },
  ];

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const destination = audioCtx.createMediaStreamDestination();
  const master = audioCtx.createGain();
  master.gain.value = 0.055;
  master.connect(destination);

  const notes = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 392];
  const startAt = audioCtx.currentTime + 0.08;
  for (let i = 0; i < Math.ceil(duration * 3); i += 1) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = i % 4 === 0 ? "triangle" : "sine";
    osc.frequency.value = notes[i % notes.length];
    const t = startAt + i * 0.33;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.32, t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.31);
  }

  const drawRoundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawFrame = () => {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);

    const t = video.currentTime;
    const caption = captions.find((item) => t >= item.start && t < item.end) ?? captions[0];

    const topGradient = ctx.createLinearGradient(0, 0, 0, 180);
    topGradient.addColorStop(0, "rgba(8,13,24,0.72)");
    topGradient.addColorStop(1, "rgba(8,13,24,0)");
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, 180);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 30px 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.fillText("PlanningGo · Mock 系统演示", 44, 58);
    ctx.font = "500 16px 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    ctx.fillText("双地图闭环 / 开源地图兜底 / POI 与路线交互", 44, 88);

    drawRoundRect(42, height - 132, width - 84, 92, 18);
    ctx.fillStyle = "rgba(15,23,42,0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 27px 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.fillText(caption.title, 72, height - 88);
    ctx.font = "500 20px 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.fillText(caption.text, 72, height - 55);

    const progress = Math.min(1, t / duration);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(72, height - 28, width - 144, 5);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(72, height - 28, (width - 144) * progress, 5);

    if (!video.ended) requestAnimationFrame(drawFrame);
  };

  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(combined, {
    mimeType: "video/webm;codecs=vp9,opus",
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  await new Promise((resolve) => {
    recorder.onstop = resolve;
    video.onended = () => setTimeout(() => recorder.stop(), 600);
    recorder.start(250);
    video.play();
    drawFrame();
  });

  const blob = new Blob(chunks, { type: "video/webm" });
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  await window.saveCaptionedVideo(btoa(binary));
}, videoDataUrl);

await browser.close();

console.log(JSON.stringify({ outputPath }, null, 2));
