// How long a fast recording takes, and where the time goes: one short song, one shape.
//   bun tools/film-time.ts [shape] [tempo] [band] [url]    (the built page: bun run build && bun run preview)
// `band` is a comma-separated list of instruments to play with it ("bass,strings,kit,flute"), or "-".
import { chromium } from "playwright-core";
const [shape = "16:9", tempo = "2", band = "-", url = "http://127.0.0.1:5341/"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on("pageerror", (e) => console.log("[uncaught]", e.message));
await page.goto(url, { waitUntil: "load" });
await page.mouse.click(720, 30);
await page.waitForTimeout(1500);
await page.evaluate(([tempo, band]) => {
  const setups = band === "-" ? {} : { twinkle: { band: true, instruments: band.split(",") } };
  (window as any).orpheon.store.set({ mode: "sing", song: "twinkle", tempo: Number(tempo), setups });
}, [tempo, band]);
await page.waitForTimeout(300);
await page.evaluate(() => (window as any).orpheon.go());
await page.waitForTimeout(800);
await page.evaluate(() => (window as any).orpheon.go());
await page.evaluate((shape) => (window as any).orpheonFilm.open(shape), shape);
await page.waitForTimeout(1000);
const download = page.waitForEvent("download", { timeout: 600_000 });
const made = await page.evaluate(() => (window as any).orpheonFilm.fast());
const file = `out/film-time.${made.container}`;
await (await download).saveAs(file);
console.log(JSON.stringify(made));
// A frame from the middle, to look at.
Bun.spawnSync(["ffmpeg", "-v", "error", "-y", "-ss", String(made.seconds / 2), "-i", file, "-frames:v", "1", `shots/film-time-${shape.replace(":", "x")}.png`]);
console.log(`frame: shots/film-time-${shape.replace(":", "x")}.png`);
await browser.close();
