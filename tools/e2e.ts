// The whole page, built: it wakes, speaks and sings, sound leaves it, and a WAV renders.
//   bun run build && bun run preview, then: bun tools/e2e.ts [url]
import { chromium } from "playwright-core";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const peak = async (ms: number) => {
  let most = 0;
  for (let t = 0; t < ms; t += 100) { most = Math.max(most, await page.evaluate(() => (window as any).orpheon.level())); await page.waitForTimeout(100); }
  return Number(most.toFixed(3));
};
await page.goto(process.argv[2] ?? "http://127.0.0.1:5341/", { waitUntil: "load" });
await page.mouse.click(720, 40); // a gesture wakes the voice
await page.waitForTimeout(1500);
console.log("audio:", await page.evaluate(() => (window as any).orpheon.store.get().audio));
for (const mode of ["speak", "sing"]) {
  await page.getByRole("button", { name: mode === "speak" ? "Speak" : "Sing" }).first().click();
  await page.waitForTimeout(800);
  if (mode === "speak") { await page.locator("textarea.say").fill("Hello. My name is Orpheon, and I can speak and sing."); await page.waitForTimeout(1500); }
  await page.evaluate(() => (window as any).orpheon.go());
  console.log(mode, "peak over 4 s:", await peak(4000), "word:", JSON.stringify(await page.locator(".word").first().textContent()));
  await page.screenshot({ path: `shots/lead-e2e-${mode}.png` });
  await page.evaluate(() => (window as any).orpheon.go());
  await page.waitForTimeout(600);
}
// The choir: the round's four voices come in one after another, each a head on the stage.
await page.evaluate(() => (window as any).orpheon.store.set({ mode: "sing", song: "jacques" }));
await page.waitForTimeout(500);
await page.evaluate(() => (window as any).orpheon.go());
const loudest = [0, 0, 0, 0, 0, 0];
let cast = 0;
for (let t = 0; t < 8000; t += 100) {
  const now = await page.evaluate(() => {
    const o = (window as any).orpheon;
    return { cast: o.stage.view.stats().singers, levels: [0, 1, 2, 3, 4, 5].map((seat) => o.sound.telemetry(seat)[1]) };
  });
  cast = Math.max(cast, now.cast);
  now.levels.forEach((level: number, seat: number) => (loudest[seat] = Math.max(loudest[seat], level)));
  await page.waitForTimeout(100);
}
const sounding = loudest.filter((level) => level > 0.05).length;
console.log("choir: heads cast", cast, "seats sounding in the first 8 s", sounding, "loudest", loudest.map((l) => l.toFixed(2)).join(" "));
if (cast !== 4) errors.push(`the round cast ${cast} heads, not 4`);
if (sounding < 2) errors.push(`only ${sounding} seat(s) sounded in the round's first 8 seconds`);
await page.screenshot({ path: "shots/lead-e2e-choir.png" });
await page.evaluate(() => (window as any).orpheon.go());
await page.waitForTimeout(1500);
const after = await page.evaluate(() => (window as any).orpheon.stage.view.stats().singers);
console.log("choir: heads after it ends", after);
if (after !== 1) errors.push(`after the round the stage still has ${after} heads`);
await page.evaluate(() => (window as any).orpheon.store.set({ song: "twinkle" }));

// A built-in song with its choir and its band ticked on: several heads sound, and so does the band.
await page.evaluate(() => {
  const o = (window as any).orpheon;
  o.store.set({ mode: "sing", song: "twinkle", setups: { twinkle: { choir: true, voices: 4, band: true, instruments: null } } });
});
await page.waitForTimeout(800);
await page.evaluate(() => (window as any).orpheon.go());
const sung = [0, 0, 0, 0, 0, 0];
const played = [0, 0, 0, 0, 0, 0, 0, 0];
let bandParts = 0;
// Staged (the default), the tune sings its first phrase alone after the band's introduction:
// the others come in from the second, so the window holds two phrases.
for (let t = 0; t < 12000; t += 100) {
  const now = await page.evaluate(() => {
    const o = (window as any).orpheon;
    return { seats: o.seats(), band: o.band(), parts: o.store.get().playing?.band?.length ?? 0 };
  });
  bandParts = Math.max(bandParts, now.parts);
  now.seats.forEach((level: number, seat: number) => (sung[seat] = Math.max(sung[seat], level)));
  now.band.forEach((level: number, slot: number) => (played[slot] = Math.max(played[slot], level)));
  await page.waitForTimeout(100);
}
const choirSounding = sung.filter((level) => level > 0.05).length;
const bandLoudest = Math.max(...played);
console.log("choir and band: seats sounding", choirSounding, "band parts", bandParts, "band loudest", bandLoudest.toFixed(3));
if (choirSounding < 2) errors.push(`with the choir on only ${choirSounding} seat(s) sounded`);
if (!(bandLoudest > 0)) errors.push("with the band on no instrument sounded");
await page.screenshot({ path: "shots/lead-e2e-band.png" });
await page.evaluate(() => (window as any).orpheon.go());
await page.waitForTimeout(1200);

// The Instrument mode: a chord on the computer keyboard sounds on several voices at once.
await page.evaluate(() => (window as any).orpheon.store.set({ mode: "instrument" }));
await page.waitForTimeout(800);
for (const key of ["a", "d", "g"]) await page.keyboard.down(key);
const voiced = [0, 0, 0, 0, 0, 0];
let chordPeak = 0;
for (let t = 0; t < 2500; t += 100) {
  const now = await page.evaluate(() => ({ seats: (window as any).orpheon.seats(), level: (window as any).orpheon.level() }));
  now.seats.forEach((level: number, seat: number) => (voiced[seat] = Math.max(voiced[seat], level)));
  chordPeak = Math.max(chordPeak, now.level);
  await page.waitForTimeout(100);
}
const chordVoices = voiced.filter((level) => level > 0.05).length;
console.log("instrument chord: voices sounding", chordVoices, "peak", chordPeak.toFixed(3));
if (chordVoices < 3) errors.push(`a three-note chord sounded on only ${chordVoices} voice(s)`);
if (!(chordPeak > 0)) errors.push("the instrument's chord made no sound");
await page.screenshot({ path: "shots/lead-e2e-instrument.png" });
for (const key of ["a", "d", "g"]) await page.keyboard.up(key);
await page.waitForTimeout(500);
await page.evaluate(() => (window as any).orpheon.store.set({ mode: "sing", song: "twinkle", setups: {} }));
await page.waitForTimeout(300);

const r = await page.evaluate(() => (window as any).orpheon.render());
console.log("wav render:", JSON.stringify(r));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
