// The numbers behind the README's figures, worked out from the engine itself.
//
//   bun tools/readme/data.ts        writes shots/readme/data.json and two WAVs beside it
//
// Then `python tools/readme/figures.py` draws the figures from them. Nothing here is typed in by
// hand: the tube shapes come from shape.ts, the resonances from theory.ts, the vowel fit from the
// table voice-fit-vowels.ts wrote, and the sound from the voice.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BODIES, POSE, POSE_KEYS, REST } from "../../src/contract.ts";
import { DENSITY, SOUND, VISCOSITY } from "../../src/voice/air.ts";
import { vowelPose } from "../../src/voice/phones.ts";
import { newAirway, shapeAirway } from "../../src/voice/shape.ts";
import { resonances, transfer } from "../../src/voice/theory.ts";
import { SECTIONS } from "../../src/voice/tube.ts";

const OUT = "shots/readme";
mkdirSync(OUT, { recursive: true });

// ── the tube for three corner vowels, and what it does to sound ──
const body = BODIES.tenor;
// The loss per odd junction for a slice of radius 1 cm, as tube.ts works it out.
const KIRCHHOFF = (Math.sqrt((2 * Math.PI * 1500 * (VISCOSITY / DENSITY)) / 2) * 1.475) / SOUND;
const vowels = ["i", "a", "u"].map((ph) => {
  const pose = Float64Array.from(POSE_KEYS, (k) => REST[k]);
  const target = vowelPose(ph as never, body);
  for (const key in target) pose[POSE[key as keyof typeof POSE]] = target[key as keyof typeof target]!;
  const airway = newAirway();
  shapeAirway(pose, body, airway);
  const friction = (4 * 2 * KIRCHHOFF * airway.length) / SECTIONS;
  const hz: number[] = [];
  const gain: number[] = [];
  for (let f = 60; f <= 5000; f += 10) {
    hz.push(f);
    gain.push(20 * Math.log10(Math.max(1e-6, transfer(airway.area, airway.length, f, friction))));
  }
  return { ph, area: Array.from(airway.area), length: airway.length, formants: resonances(airway.area, airway.length, 4, 5000), hz, gain };
});

// ── the vowel fit: what was wanted (published averages) and what the voice gives ──
const fit: { ph: string; body: string; want: number[]; heard: number[] }[] = [];
for (const line of readFileSync("src/voice/vowels.generated.ts", "utf8").split("\n")) {
  const m = line.match(/^\/\/ {3}(\S+) (child|woman|man) +want +(\d+) (\d+) (\d+) +heard +(\d+) (\d+) (\d+)/);
  if (m) fit.push({ ph: m[1], body: m[2], want: [+m[3], +m[4], +m[5]], heard: [+m[6], +m[7], +m[8]] });
}

writeFileSync(`${OUT}/data.json`, JSON.stringify({ vowels, fit, sections: SECTIONS }));
console.log(`wrote ${OUT}/data.json: ${vowels.map((v) => `${v.ph} ${v.formants.map(Math.round).join("/")} Hz`).join(", ")}; ${fit.length} fitted vowels`);
