// Fit the vowels: find, for each vowel and each of three bodies, the pose whose tube resonates at
// the published formants. Writes src/voice/vowels.generated.ts.
//
//   bun tools/voice-fit-vowels.ts            fit everything and write the table (a minute or two)
//   bun tools/voice-fit-vowels.ts --check    only measure the table that is there
//
// How: the resonances of a pose's tube come straight from its area function (src/voice/theory.ts),
// so a search over the pose (Nelder & Mead 1965) can match them to the targets. The tube alone is
// not the whole story (the open glottis raises the first formant a few percent), so each fitted
// pose is then rendered by the real engine, its formants measured from the sound by linear
// prediction, and the fit repeated aiming off by the difference. The errors printed and written
// at the end are measured from rendered sound, not from the theory.
//
// The fit is deterministic. Rerun it whenever shape.ts, tube.ts or folds.ts change the sound.
import { POSE_KEYS, REST } from "../src/contract.ts";
import type { Body, PhoneSymbol, Pose } from "../src/contract.ts";
import { newAirway, shapeAirway } from "../src/voice/shape.ts";
import { resonances } from "../src/voice/theory.ts";
import { heardFormants } from "../tests/voice/helpers.ts";
import { FIT_BODIES, VOWEL_TARGETS } from "../tests/voice/published.ts";
import type { Trio } from "../tests/voice/published.ts";

/** The pose values a vowel sets. The search moves the first `free` of them. */
const KEYS = ["jaw", "tongueX", "tongueY", "lips", "round", "larynx", "tip", "tipX"] as const;
/** The range the search may use for each. */
const LOW = [0, 0, 0, 0.25, 0, -1, 0, 0];
const HIGH = [1, 1, 1, 1, 1, 1, 1, 1];
type Key = (typeof KEYS)[number];

/** Where each vowel's search starts and what it is pulled toward: the textbook description of the vowel. */
const START: Record<string, number[]> = {
  i: [0.2, 1.0, 0.65, 0.6, 0.0, 0, 0, 0.5],
  y: [0.2, 0.95, 0.65, 0.4, 0.9, 0, 0, 0.5],
  ɨ: [0.25, 0.75, 0.65, 0.6, 0.1, 0, 0, 0.5],
  ɯ: [0.25, 0.6, 0.7, 0.6, 0.0, 0, 0, 0.5],
  u: [0.2, 0.55, 0.7, 0.35, 1.0, 0, 0, 0.5],
  ɪ: [0.3, 0.9, 0.5, 0.6, 0.0, 0, 0, 0.5],
  ʊ: [0.3, 0.55, 0.55, 0.45, 0.8, 0, 0, 0.5],
  e: [0.3, 0.95, 0.5, 0.6, 0.0, 0, 0, 0.5],
  ø: [0.3, 0.9, 0.5, 0.45, 0.9, 0, 0, 0.5],
  o: [0.35, 0.4, 0.6, 0.4, 0.9, 0, 0, 0.5],
  ə: [0.4, 0.5, 0.3, 0.6, 0.2, 0, 0, 0.5],
  ɛ: [0.5, 0.85, 0.35, 0.65, 0.0, 0, 0, 0.5],
  œ: [0.5, 0.8, 0.35, 0.5, 0.8, 0, 0, 0.5],
  ɜ: [0.45, 0.55, 0.35, 0.6, 0.2, 0, 0, 0.5],
  ʌ: [0.55, 0.35, 0.4, 0.65, 0.1, 0, 0, 0.5],
  ɔ: [0.5, 0.25, 0.55, 0.45, 0.8, 0, 0, 0.5],
  æ: [0.75, 0.8, 0.15, 0.75, 0.0, 0, 0, 0.5],
  a: [0.85, 0.5, 0.25, 0.8, 0.0, 0, 0, 0.5],
  ɑ: [0.8, 0.15, 0.5, 0.8, 0.1, 0, 0, 0.5],
  ɒ: [0.7, 0.15, 0.55, 0.55, 0.7, 0, 0, 0.5],
  // The r-coloured vowel also curls the tip up behind the ridge: that is what pulls F3 down.
  ɚ: [0.35, 0.6, 0.6, 0.45, 0.6, 0, 0.5, 1.0],
};
/** How many of KEYS the search may move. */
const FREE: Record<string, number> = { ɚ: 7 };

const WEIGHT = [1, 1, 0.6];
/** No part of a vowel's tube may be this narrow (cm² for the reference man): it would hiss. */
const NARROWEST = 0.3;
const NARROWEST_LIPS = 0.2;

const airway = newAirway();
const poseArray = new Float64Array(POSE_KEYS.length);

function poseOf(values: number[]): Pose {
  const pose: Pose = { ...REST, velum: 0, lungs: 0.6, glottis: 0.5 };
  KEYS.forEach((k: Key, i) => (pose[k] = values[i]));
  return pose;
}

function tubeOf(values: number[], body: Body) {
  const pose = poseOf(values);
  POSE_KEYS.forEach((k, i) => (poseArray[i] = pose[k]));
  shapeAirway(poseArray, body, airway);
  return airway;
}

/** How far the tube of `values` is from resonating at `aim`, plus what keeps the pose sensible. */
function cost(values: number[], body: Body, aim: number[], start: number[]): number {
  let penalty = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < LOW[i]) penalty += 100 * (LOW[i] - values[i]) ** 2;
    if (values[i] > HIGH[i]) penalty += 100 * (values[i] - HIGH[i]) ** 2;
    penalty += 0.0015 * ((values[i] - start[i]) / (KEYS[i] === "larynx" ? 1 : 0.3)) ** 2;
  }
  const tube = tubeOf(values.map((v, i) => Math.min(HIGH[i], Math.max(LOW[i], v))), body);
  const size = (body.tract / 17.5) ** 2;
  let narrow = Infinity;
  for (let j = 5; j < tube.area.length - 2; j++) narrow = Math.min(narrow, tube.area[j]);
  if (narrow < NARROWEST * size) penalty += 30 * (1 - narrow / (NARROWEST * size)) ** 2;
  const lip = tube.area[tube.area.length - 1];
  if (lip < NARROWEST_LIPS * size) penalty += 30 * (1 - lip / (NARROWEST_LIPS * size)) ** 2;
  const found = resonances(tube.area, tube.length, 3);
  if (found.length < 3) return 1e3;
  let miss = 0;
  for (let i = 0; i < 3; i++) miss += WEIGHT[i] * Math.log(found[i] / aim[i]) ** 2;
  return miss + penalty;
}

/** Nelder & Mead's downhill simplex. */
function search(f: (x: number[]) => number, from: number[], free: number, spread: number): number[] {
  const fixed = from.slice(free);
  const g = (x: number[]) => f([...x, ...fixed]);
  let simplex = [from.slice(0, free)];
  for (let i = 0; i < free; i++) {
    const p = from.slice(0, free);
    p[i] += p[i] > 0.5 ? -spread : spread;
    simplex.push(p);
  }
  let values = simplex.map(g);
  for (let iter = 0; iter < 600; iter++) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (values[free] - values[0] < 1e-9) break;
    const centre = new Array(free).fill(0);
    for (let i = 0; i < free; i++) for (let k = 0; k < free; k++) centre[k] += simplex[i][k] / free;
    const worst = simplex[free];
    const toward = (t: number) => centre.map((c, k) => c + t * (worst[k] - c));
    const reflected = toward(-1);
    const fr = g(reflected);
    if (fr < values[0]) {
      const expanded = toward(-2);
      const fe = g(expanded);
      [simplex[free], values[free]] = fe < fr ? [expanded, fe] : [reflected, fr];
    } else if (fr < values[free - 1]) {
      [simplex[free], values[free]] = [reflected, fr];
    } else {
      const contracted = toward(fr < values[free] ? -0.5 : 0.5);
      const fc = g(contracted);
      if (fc < Math.min(fr, values[free])) [simplex[free], values[free]] = [contracted, fc];
      else {
        for (let i = 1; i <= free; i++) {
          simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k]));
          values[i] = g(simplex[i]);
        }
      }
    }
  }
  const best = values.indexOf(Math.min(...values));
  return [...simplex[best], ...fixed].map((v, i) => Math.min(HIGH[i], Math.max(LOW[i], v)));
}

/** The best pose for an aim: the search run from the textbook start and from a few nudged starts. */
function fit(body: Body, aim: number[], start: number[], from: number[], free: number): number[] {
  let best = from;
  let bestCost = Infinity;
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const begin = (attempt === 0 ? from : start).map((v, i) => (attempt < 2 || i >= free ? v : v + 0.15 * random()));
    const found = search((x) => cost(x, body, aim, start), begin, free, attempt % 2 ? 0.12 : 0.06);
    const c = cost(found, body, aim, start);
    if (c < bestCost) [best, bestCost] = [found, c];
  }
  return best;
}

/** Render a pose with the engine and measure its first three formants from the sound. */
function measure(values: number[], body: Body): number[] {
  return heardFormants(poseOf(values), body);
}

const groups = ["child", "woman", "man"] as const;
const check = process.argv.includes("--check");
/** --quick: trust the theory and render nothing. For trying a change to shape.ts; writes nothing. */
const quick = process.argv.includes("--quick");
const table: Record<string, number[][]> = {};
const notes: string[] = [];
let worst = 0;
let sumSquares = 0;
let count = 0;

if (check) {
  const old = await import("../src/voice/vowels.generated.ts");
  for (const ph in old.FITTED_VOWELS) table[ph] = old.FITTED_VOWELS[ph].map((row: number[]) => KEYS.map((k) => row[old.FITTED_KEYS.indexOf(k)]));
}

for (const ph of Object.keys(VOWEL_TARGETS) as PhoneSymbol[]) {
  const target = VOWEL_TARGETS[ph]!;
  const rows: number[][] = [];
  for (const who of groups) {
    const body = FIT_BODIES[who];
    const want: Trio = target[who];
    let values = check ? table[ph][groups.indexOf(who)] : START[ph];
    if (!check) {
      const free = FREE[ph] ?? 6;
      let aim: number[] = want;
      values = fit(body, aim, START[ph], START[ph], free);
      for (let round = 0; round < (quick ? 0 : 2); round++) {
        const heard = measure(values, body);
        const tube = tubeOf(values, body);
        const theory = resonances(tube.area, tube.length, 3);
        // Aim the tube off by however much the rendered sound differs from it.
        aim = want.map((hz, i) => hz / Math.min(1.15, Math.max(0.87, heard[i] / theory[i])));
        values = fit(body, aim, START[ph], values, free);
      }
    }
    const heard = quick ? resonances(tubeOf(values, body).area, tubeOf(values, body).length, 3) : measure(values, body);
    const errors = heard.map((hz, i) => (100 * (hz - want[i])) / want[i]);
    for (const e of errors) {
      worst = Math.max(worst, Math.abs(e));
      sumSquares += e * e;
      count++;
    }
    const line = `${ph} ${who.padEnd(5)} want ${want.join(" ")}  heard ${heard.map((v) => v.toFixed(0)).join(" ")}  off ${errors.map((e) => (e >= 0 ? "+" : "") + e.toFixed(1) + "%").join(" ")}`;
    console.log(line, check ? "" : " pose " + values.map((v) => v.toFixed(2)).join(" "));
    notes.push(line);
    rows.push(values);
  }
  table[ph] = rows;
}
console.log(`measured from rendered sound: rms error ${Math.sqrt(sumSquares / count).toFixed(1)}%, worst ${worst.toFixed(1)}%`);

if (!check && !quick) {
  const lines = [
    "// GENERATED by `bun tools/voice-fit-vowels.ts`. Do not edit: change the tool or the model and run it again.",
    "//",
    "// Each vowel's pose for a child, a woman and a man (tests/voice/published.ts says who they are and",
    "// which measurements they were fitted to). As rendered and measured when this was written:",
    "//",
    ...notes.map((n) => "//   " + n),
    `//   rms error ${Math.sqrt(sumSquares / count).toFixed(1)}%, worst ${worst.toFixed(1)}%`,
    "",
    "/** Tract length in cm of the three fitted bodies: child, woman, man. */",
    `export const FITTED_TRACTS = [${groups.map((g) => FIT_BODIES[g].tract).join(", ")}];`,
    "/** The pose value in each column. */",
    `export const FITTED_KEYS = [${KEYS.map((k) => `"${k}"`).join(", ")}] as const;`,
    "/** For each vowel, a row per body. */",
    "export const FITTED_VOWELS: Record<string, number[][]> = {",
    ...Object.entries(table).map(([ph, rows]) => `  ${ph}: [${rows.map((r) => `[${r.map((v) => v.toFixed(3)).join(", ")}]`).join(", ")}],`),
    "};",
    "",
  ];
  await Bun.write(new URL("../src/voice/vowels.generated.ts", import.meta.url), lines.join("\n"));
  console.log("wrote src/voice/vowels.generated.ts");
}
