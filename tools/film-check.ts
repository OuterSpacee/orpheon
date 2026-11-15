// Video mode, end to end, on the built page: fast recordings in 9:16 and 16:9 and a real-time one,
// each saved to out/ and checked with ffprobe (size, frame rate, duration, sound, frames that
// change), a frame of each pulled into shots/ to look at.
//   bun run build && bun run preview, then: bun tools/film-check.ts [url] [--webm] [--fps 60] [--only fast|live]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const webm = args.includes("--webm");
const fpsAt = args.indexOf("--fps");
const fps = fpsAt >= 0 ? Number(args[fpsAt + 1]) : 30;
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? args[onlyAt + 1] : "";
const url = args.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:5341/";
mkdirSync("out", { recursive: true });
mkdirSync("shots", { recursive: true });

const problems: string[] = [];
const run = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
};

/** What ffprobe says about a file, and whether it is what was asked for. */
function probe(file: string, want: { width: number; height: number; fps?: number; seconds?: number }): void {
  const r = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,duration:format=duration,format_name", "-of", "json", file]);
  if (!r.ok) return void problems.push(`${file}: ffprobe failed: ${r.err}`);
  const info = JSON.parse(r.out);
  const video = info.streams.find((s: any) => s.codec_type === "video");
  const audio = info.streams.find((s: any) => s.codec_type === "audio");
  const duration = Number(info.format.duration ?? video?.duration);
  const rate = video ? eval(video.avg_frame_rate === "0/0" ? video.r_frame_rate : video.avg_frame_rate) : 0;
  console.log(`  ffprobe: ${info.format.format_name}, video ${video?.codec_name} ${video?.width}x${video?.height} ${rate.toFixed(2)} fps, audio ${audio?.codec_name ?? "none"}, ${duration.toFixed(3)} s`);
  if (!video || video.width !== want.width || video.height !== want.height) problems.push(`${file}: size ${video?.width}x${video?.height}, wanted ${want.width}x${want.height}`);
  if (!audio) problems.push(`${file}: no sound`);
  if (want.fps && Math.abs(rate - want.fps) > 0.05) problems.push(`${file}: ${rate} fps, wanted ${want.fps}`);
  if (want.seconds && !(Math.abs(duration - want.seconds) <= 0.1)) problems.push(`${file}: lasts ${duration} s, the performance ${want.seconds} s`);
}

/** Do frames a few seconds apart differ? And keep one to look at. */
function frames(file: string, shot: string, at: number[]): void {
  const sums = at.map((t) => run(["ffmpeg", "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "md5", "-"]).out.trim());
  console.log(`  frames at ${at.join(", ")} s: ${new Set(sums).size} different of ${sums.length}`);
  if (new Set(sums).size < sums.length) problems.push(`${file}: frames at ${at.join(", ")} s are not all different`);
  const r = run(["ffmpeg", "-v", "error", "-y", "-ss", String(at[1]), "-i", file, "-frames:v", "1", shot]);
  if (!r.ok) problems.push(`${file}: no frame extracted: ${r.err}`);
  else console.log(`  frame: ${shot}`);
}

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
await page.goto(url, { waitUntil: "load" });
await page.mouse.click(720, 30);
await page.waitForTimeout(1500);

/** Perform a song for a moment, so it is the last performance, then stop. */
async function perform(song: string): Promise<void> {
  await page.evaluate((song) => (window as any).orpheon.store.set({ mode: "sing", song }), song);
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(500);
}

async function fast(song: string, shape: string, width: number, height: number, options: { webm?: boolean } = {}): Promise<void> {
  console.log(`fast ${shape} "${song}"${options.webm ? " (WebM)" : ""}:`);
  await perform(song);
  await page.evaluate(([shape, fps]) => {
    (window as any).orpheonFilm.set({ fps });
    (window as any).orpheonFilm.open(shape);
  }, [shape, fps] as const);
  await page.waitForTimeout(1500);
  const tag = `${shape.replace(":", "x")}${options.webm ? "-webm" : ""}`;
  await page.screenshot({ path: `shots/film-page-${tag}.png` });
  const download = page.waitForEvent("download", { timeout: 600_000 });
  const began = Date.now();
  const made = await page.evaluate((options) => (window as any).orpheonFilm.fast(options), options);
  const file = `out/${(await download).suggestedFilename()}`;
  await (await download).saveAs(file);
  console.log(`  ${file}: ${(made.bytes / 1e6).toFixed(1)} MB, ${made.seconds.toFixed(2)} s of video made in ${((Date.now() - began) / 1000).toFixed(1)} s (${made.container})`);
  console.log(`  time spent (s): ${Object.entries(made.spent ?? {}).map(([k, v]) => `${k} ${(v as number).toFixed(1)}`).join(", ")}`);
  probe(file, { width, height, fps, seconds: made.seconds });
  frames(file, `shots/film-frame-${tag}.png`, [2, made.seconds / 2, made.seconds - 1.5]);
}

if (only !== "live") {
  await fast("twinkle", "9:16", 1080, 1920);
  await fast("jacques", "16:9", 1920, 1080);
  if (webm) await fast("twinkle", "1:1", 1080, 1080, { webm: true });
}
if (only !== "fast") await live();

// Real time: Sing starts with the recording; a few seconds of it are kept.
async function live(): Promise<void> {
console.log("live 16:9:");
await page.evaluate(() => (window as any).orpheon.store.set({ mode: "sing", song: "twinkle" }));
await page.evaluate(() => (window as any).orpheonFilm.open("16:9"));
await page.waitForTimeout(800);
const download = page.waitForEvent("download", { timeout: 60_000 });
await page.evaluate(() => (window as any).orpheonFilm.live());
await page.waitForTimeout(5000);
await page.screenshot({ path: "shots/film-page-live.png" });
const made = await page.evaluate(() => (window as any).orpheonFilm.stop());
const file = `out/${(await download).suggestedFilename()}`;
await (await download).saveAs(file);
console.log(`  ${file}: ${(made.bytes / 1e6).toFixed(1)} MB, about ${made.seconds.toFixed(1)} s (${made.container})`);
probe(file, { width: 1920, height: 1080 });
frames(file, "shots/film-frame-live.png", [1, 2.5, 4]);
const counted = run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).out.trim();
console.log(`  ${counted} frames in about ${made.seconds.toFixed(1)} s: ${(Number(counted) / made.seconds).toFixed(1)} a second`);
if (Number(counted) / made.seconds < fps * 0.6) problems.push(`${file}: only ${counted} frames recorded live`);
await page.evaluate(() => (window as any).orpheon.go());
}

await browser.close();
console.log("problems:", problems.length ? problems : "none");
process.exit(problems.length ? 1 : 0);
