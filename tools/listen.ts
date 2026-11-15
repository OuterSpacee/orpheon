// Songs as the page performs them, saved as the page's own WAV export (voices, band, room and
// limiter), for the owner to listen to: nobody here can hear.
//
//   bun run build && bun run preview, then:
//   bun tools/listen.ts [song ...] [--band bass,harp] [--voices 4] [--style staged|hymn|oohs|round] [--solo] [--no-band]
//
// Each song is sung by the choir with its band (the arranger's suggestion unless --band names
// one) and written to out/listen/<song>.wav.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const values = new Set(["band", "voices", "style", "url"].map((n) => args.indexOf(`--${n}`) + 1).filter((i) => i > 0));
const songs = args.filter((a, i) => !a.startsWith("--") && !values.has(i));
const url = flag("url") ?? "http://127.0.0.1:5341/";
const setup = {
  choir: !args.includes("--solo"),
  band: !args.includes("--no-band"),
  voices: Number(flag("voices") ?? 4),
  style: flag("style") ?? "staged",
  instruments: flag("band")?.split(",") ?? null,
};

mkdirSync("out/listen", { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await page.mouse.click(640, 40); // a gesture wakes the sound
await page.waitForTimeout(1500);

for (const song of songs.length ? songs : ["twinkle", "grace", "old100", "jacques"]) {
  await page.evaluate(([song, setup]) => (window as any).orpheon.store.set({ mode: "sing", song, setups: { [song as string]: setup } }), [song, setup] as const);
  await page.waitForTimeout(300);
  // play it for a moment and stop: the performance it made is the one the file is made from
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as any).orpheon.go());
  const r = await page.evaluate(() => (window as any).orpheon.render(true));
  if (!r?.wav) {
    console.log(`${song}: nothing rendered`);
    continue;
  }
  const path = `out/listen/${song}.wav`;
  await Bun.write(path, Buffer.from(r.wav, "base64"));
  console.log(`${path}  ${r.seconds.toFixed(1)} s, peak ${r.peak.toFixed(2)}, rendered in ${r.took.toFixed(1)} s`);
}
if (errors.length) console.log("errors:", errors);
await browser.close();
