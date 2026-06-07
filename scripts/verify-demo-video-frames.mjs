import path from "node:path";
import { chromium } from "playwright";

const videoPath = path.resolve(process.cwd(), "dist/planninggo-browser-full-demo.mp4");
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const url = `file:///${videoPath.replace(/\\/g, "/")}`;
await page.setContent(`<video src="${url}" controls style="width:100%;height:100%;background:#111"></video>`);
const info = await page.evaluate(async () => {
  const video = document.querySelector("video");
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
    if (video.readyState >= 1) resolve();
  });
  return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
});
const points = [4, 18, 45, 80, Math.max(4, info.duration - 8)].filter((value) => value < info.duration);
for (const point of points) {
  await page.evaluate((time) => {
    const video = document.querySelector("video");
    video.currentTime = time;
  }, point);
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });
  });
  await page.screenshot({
    path: path.resolve(process.cwd(), `dist/planninggo-browser-full-demo-frame-${Math.round(point)}s.png`),
    fullPage: false,
  });
}
await browser.close();
console.log(JSON.stringify({ videoPath, info, sampledSeconds: points }, null, 2));
