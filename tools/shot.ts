// Take a picture of a page and print what it logged.
//
//   bun tools/shot.ts <url> <out.png> [--size 1440x900] [--wait 1500] [--eval "js"] [--click "css"]
//
// --eval runs in the page before the picture (after the wait), and its result is printed.
// --click clicks an element first (a user gesture, so audio may start).
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const size = flag("size", "1440x900").split("x").map(Number);
const wait = Number(flag("wait", "1500"));
const script = flag("eval", "");
const click = flag("click", "");
const [url, out] = args;
if (!url || !out) {
  console.error("usage: bun tools/shot.ts <url> <out.png> [--size WxH] [--wait ms] [--eval js] [--click css]");
  process.exit(2);
}

const browser = await chromium.launch({
  args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
await page.goto(url, { waitUntil: "load" });
if (click) await page.click(click);
await page.waitForTimeout(wait);
if (script) console.log("eval:", JSON.stringify(await page.evaluate(script)));
await page.screenshot({ path: out });
await browser.close();
console.log(`saved ${out}`);
