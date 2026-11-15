// The README's sound and video samples, made the way a visitor would make them.
//
//   bun run build && bun run preview          (in another terminal: http://127.0.0.1:5341/)
//   bun tools/readme/samples.ts               writes public/samples/*.mp3 and public/samples/demo.mp4
//
// The songs are the page's own WAV export (voices, band, room, limiter); the spoken lines come
// from tools/render.ts; the film is the page's fast video recording. Everything sung is in the
// public domain. They live in public/ so the site serves them, which lets the README link to them.
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright-core";

const URL = process.argv.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:5341/";
const WORK = "out/samples";
const OUT = "public/samples";
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

function run(cmd: string[]): void {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}\n${r.stderr.toString()}`);
}

/**
 * A WAV as a small MP3, its quiet start trimmed, its end faded if it is cut short. A line from
 * render.ts comes out at the voice's own level, well below the page's limited mix, so it is
 * brought up to the songs' loudness.
 */
function mp3(wav: string, name: string, longest = 0, louder = false): void {
  const filters = ["silenceremove=start_periods=1:start_threshold=-60dB"];
  if (longest) filters.push(`afade=t=out:st=${longest - 2.5}:d=2.5`);
  if (louder) filters.push("loudnorm=I=-17:TP=-2:LRA=11");
  run(["ffmpeg", "-y", "-v", "error", "-i", wav, ...(longest ? ["-t", String(longest)] : []), "-af", filters.join(","), "-ar", "48000", "-codec:a", "libmp3lame", "-b:a", "128k", `${OUT}/${name}.mp3`]);
  console.log(`${OUT}/${name}.mp3  ${(Bun.file(`${OUT}/${name}.mp3`).size / 1024).toFixed(0)} KB`);
}

// ── speaking: three bodies, one line each ──
const LINES: [string, string, string][] = [
  ["speak-tenor", "tenor", "Hello. I am a voice made of air, flesh and light. Nothing you hear was ever recorded."],
  ["speak-soprano", "soprano", "Every sound starts in two small folds, deep in the throat, and leaves through the lips."],
  ["speak-child", "child", "A smaller body has a shorter throat, so its voice is higher and brighter."],
];
for (const [name, body, line] of LINES) {
  run(["bun", "tools/render.ts", "--say", line, `${WORK}/${name}.wav`, "--body", body]);
  mp3(`${WORK}/${name}.wav`, name, 0, true);
}
run(["bun", "tools/render.ts", "ˈa:0.9 ˈe:0.9 ˈi:0.9 ˈo:0.9 ˈu:1.4", `${WORK}/vowels.wav`, "--body", "soprano", "--pitch", "0:392,0.9:440,1.8:494,2.7:523,3.6:587,5:587"]);
mp3(`${WORK}/vowels.wav`, "sing-vowels", 0, true);

// ── singing, as the page performs it ──
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on("pageerror", (e) => console.log(`[page] ${e.message}`));
await page.goto(URL, { waitUntil: "load" });
await page.mouse.click(720, 30);
await page.waitForTimeout(1500);

/** Start a song and stop it at once: the page keeps it as the last performance. */
async function perform(song: string, setup: object): Promise<void> {
  await page.evaluate(([song, setup]) => (window as any).orpheon.store.set({ mode: "sing", song, setups: { [song as string]: setup } }), [song, setup] as const);
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(300);
}

const SONGS: [string, string, object, number][] = [
  ["sing-twinkle-solo", "twinkle", { choir: false, band: false, voices: 1, style: "staged", instruments: null }, 0],
  ["sing-joy-choir", "joy", { choir: true, band: true, voices: 4, style: "staged", instruments: null }, 45],
  ["sing-jacques-round", "jacques", { choir: true, band: false, voices: 4, style: "round", instruments: null }, 40],
  ["sing-old100-hymn", "old100", { choir: true, band: false, voices: 4, style: "hymn", instruments: null }, 40],
];
for (const [name, song, setup, longest] of SONGS) {
  await perform(song, setup);
  const r = await page.evaluate(() => (window as any).orpheon.render(true));
  if (!r?.wav) throw new Error(`${song}: nothing rendered`);
  await Bun.write(`${WORK}/${name}.wav`, Buffer.from(r.wav, "base64"));
  mp3(`${WORK}/${name}.wav`, name, longest && r.seconds > longest ? longest : 0);
}

// ── the film: Ode to joy by the choir, recorded by the page's own Video ──
await perform("joy", SONGS[1][2]);
await page.evaluate(() => {
  (window as any).orpheonFilm.set({ fps: 30 });
  (window as any).orpheonFilm.open("16:9");
});
await page.waitForTimeout(1500);
const download = page.waitForEvent("download", { timeout: 900_000 });
await page.evaluate(() => (window as any).orpheonFilm.fast({}));
const raw = `${WORK}/${(await download).suggestedFilename()}`;
await (await download).saveAs(raw);
await browser.close();
run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-vf", "scale=1280:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", `${OUT}/demo.mp4`]);
run(["ffmpeg", "-y", "-v", "error", "-ss", "12", "-i", `${OUT}/demo.mp4`, "-frames:v", "1", "-q:v", "4", `${OUT}/demo.jpg`]);
console.log(`${OUT}/demo.mp4  ${(Bun.file(`${OUT}/demo.mp4`).size / 1e6).toFixed(1)} MB`);
rmSync(raw);
