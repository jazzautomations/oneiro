// Headless render harness for Oneiro dream scenes.
// Renders the scene in software-WebGL chromium (swiftshader) and walks the
// vignette phases — cartela → live → climax → cut → note — screenshotting each
// so we can SEE what ships on machines without a GPU. Usage:
//
//   bun scripts/headless-check.mjs [url] [outDir]
//
//   bun scripts/headless-check.mjs http://localhost:3022/dream/ant-city-demo /tmp/oneiro-shots

import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:3022/dream/ant-city-demo?debug=1";
const outDir = process.argv[3] ?? "/tmp/oneiro-shots";
mkdirSync(outDir, { recursive: true });

const debugUrl = url.includes("?") ? `${url}&debug=1` : `${url}?debug=1`;

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: "new",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=430,860",
    "--disable-dev-shm-usage",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 1 });
page.on("console", (m) => {
  const t = m.text();
  if (/error|failed|warn/i.test(t)) console.log("[console]", t.slice(0, 220));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

const o = () =>
  page.evaluate(() => {
    const x = globalThis.__oneiro;
    return x
      ? { phase: x.phase?.(), cam: x.cam?.(), presence: x.presence?.() }
      : null;
  });

console.log("loading", debugUrl);
await page.goto(debugUrl, { waitUntil: "networkidle2", timeout: 60000 });

// cartela — should be showing right now
await new Promise((r) => setTimeout(r, 800));
console.log("state@0.8s:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/1-cartela.png` });

// live — cartela lifts, presence still arriving from the fog
await new Promise((r) => setTimeout(r, 6000));
console.log("state@7s:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/2-live-arrival.png` });

// live later — presence at/near its mark; chorus stepping
await new Promise((r) => setTimeout(r, 25000));
console.log("state@32s:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/3-live.png` });

// break the rule → climax (freeze + the presence turns)
await page.evaluate(() => globalThis.__oneiro?.breakRule?.());
await new Promise((r) => setTimeout(r, 1500));
console.log("state@climax:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/4-climax.png` });

// cut → black
await new Promise((r) => setTimeout(r, 1400));
console.log("state@cut:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/5-cut.png` });

// note — the morning annotation
await new Promise((r) => setTimeout(r, 1600));
console.log("state@note:", JSON.stringify(await o()));
await page.screenshot({ path: `${outDir}/6-note.png` });

await browser.close();
console.log("done →", outDir);
