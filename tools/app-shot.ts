// A picture of the page after a few steps, for looking at states a single click cannot reach
// (a song playing, a section opened, a chord held).
//
//   bun tools/app-shot.ts <url> <out.png> [--size 1440x900] [--do "js"] [--wait ms] [--do "js"] ...
//
// The page is clicked once first (a gesture, so the voice wakes). Each --do runs in the page and
// each --wait waits, in the order given; the picture is taken at the end. Errors are printed.
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const [url, out] = args;
if (!url || !out) {
  console.error('usage: bun tools/app-shot.ts <url> <out.png> [--size WxH] [--do "js"] [--wait ms] ...');
  process.exit(2);
}
const sizeAt = args.indexOf("--size");
const [width, height] = (sizeAt >= 0 ? args[sizeAt + 1] : "1440x900").split("x").map(Number);

const browser = await chromium.launch({
  args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width, height } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);
await page.mouse.click(width / 2, 12);
for (let i = 2; i < args.length; i += 2) {
  if (args[i] === "--do") console.log("do:", JSON.stringify(await page.evaluate(args[i + 1])));
  else if (args[i] === "--wait") await page.waitForTimeout(Number(args[i + 1]));
}
// Keep the controls from fading while the picture is taken.
await page.mouse.move(6, height - 6);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log(`saved ${out}`);
