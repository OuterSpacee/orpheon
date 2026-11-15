// Make the video of one song, as the page's Record fast makes it, and save it to out/.
//
//   bun run build && bun run preview, then:
//   bun tools/film-song.ts <song> [--shape 16:9] [--look score] [--motion cinematic] [--url http://127.0.0.1:5341/]
//
// The song plays with its choir and its band on, for a moment, so it is the last performance;
// then Video opens in the shape and look asked and records it faster than real time.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const shape = flag("shape", "16:9");
const look = flag("look", "score");
const motion = flag("motion", "cinematic");
const url = flag("url", "http://127.0.0.1:5341/");
const song = args[0];
if (!song) {
  console.error("usage: bun tools/film-song.ts <song> [--shape 16:9] [--look score] [--url ...]");
  process.exit(2);
}
mkdirSync("out", { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
page.on("console", (m) => m.type() === "error" && console.log(`[error] ${m.text()}`));
await page.goto(url, { waitUntil: "load" });
await page.mouse.click(720, 30);
await page.waitForTimeout(1500);
await page.evaluate((song) => {
  const o = (window as any).orpheon;
  o.store.set({ mode: "sing", song, setups: { [song]: { choir: true, voices: 4, band: true, instruments: null } } });
}, song);
await page.waitForTimeout(500);
await page.evaluate(() => (window as any).orpheon.go());
await page.waitForTimeout(1500);
await page.evaluate(() => (window as any).orpheon.go());
await page.waitForTimeout(500);
await page.evaluate(([shape, look, motion]) => {
  (window as any).orpheonFilm.set({ look, motion });
  (window as any).orpheonFilm.open(shape);
}, [shape, look, motion]);
await page.waitForTimeout(1500);
const began = Date.now();
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 1_200_000 }), page.evaluate(() => (window as any).orpheonFilm.fast())]);
const name = `out/${download.suggestedFilename()}`;
await download.saveAs(name);
console.log(`${name}, made in ${((Date.now() - began) / 1000).toFixed(1)} s`);
await browser.close();
