// Pictures of the video's frame in each look, a few seconds into a song, to look at.
//
//   bun tools/film-looks.ts [--url http://127.0.0.1:5340/] [--song twinkle | --midi file.mid] [--band harp,bass,strings] [--shape 16:9] [--at 6]
//
// Plays the song on the page (its sound runs as heard), opens Video, and saves the frame itself
// (the canvas the recording would take) for each look to shots/look-<look>.png.
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = flag("url", "http://127.0.0.1:5340/");
const song = flag("song", "jacques");
const band = flag("band", "");
const shape = flag("shape", "16:9");
const at = Number(flag("at", "6"));
const looks = flag("looks", "score,stage,band,heads").split(",");
const midi = flag("midi", "");
const motion = flag("motion", "");
const every = Number(flag("every", "0"));

const browser = await chromium.launch({
  args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log(`[error] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => (window as any).orpheon && (window as any).orpheonFilm, null, { timeout: 30000 });
await page.mouse.click(700, 450);
if (midi) {
  // The file goes in as a person would give it: through Sing's file input.
  await page.evaluate(() => (window as any).orpheon.store.set({ mode: "sing" }));
  await page.waitForTimeout(500);
  await page.setInputFiles('input[type="file"]', midi);
  await page.waitForTimeout(2500);
}
await page.evaluate(
  ([song, band]) => {
    const o = (window as any).orpheon;
    o.store.set({ mode: "sing", song, setups: { [song]: { choir: true, voices: 4, band: true, instruments: band ? band.split(",") : null } } });
  },
  [midi ? "imported" : song, band],
);
await page.waitForTimeout(1500);
await page.evaluate((shape) => (window as any).orpheonFilm.open(shape), shape);
if (motion) await page.evaluate((motion) => (window as any).orpheonFilm.set({ motion }), motion);
await page.evaluate(() => (window as any).orpheon.go?.());
await page.waitForTimeout(at * 1000);
// --every s: a series of frames of the first look, s seconds apart, to see the motion
if (every > 0) {
  await page.evaluate((look) => (window as any).orpheonFilm.set({ look }), looks[0]);
  for (let k = 0; k < 4; k++) {
    const data = await page.evaluate(() => (document.querySelector(".film-picture") as HTMLCanvasElement).toDataURL("image/png"));
    await Bun.write(`shots/motion-${k}.png`, Buffer.from(data.split(",")[1], "base64"));
    console.log(`saved shots/motion-${k}.png`);
    await page.waitForTimeout(every * 1000);
  }
  await browser.close();
  process.exit(0);
}
for (const look of looks) {
  await page.evaluate((look) => (window as any).orpheonFilm.set({ look }), look);
  await page.waitForTimeout(700);
  const data = await page.evaluate(() => (document.querySelector(".film-picture") as HTMLCanvasElement).toDataURL("image/png"));
  await Bun.write(`shots/look-${look}.png`, Buffer.from(data.split(",")[1], "base64"));
  console.log(`saved shots/look-${look}.png`);
}
await browser.close();
