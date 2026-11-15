// How much of the processor does the band take? Each instrument plays ten seconds of a busy part
// (chords, runs and repeated notes) at 48 kHz in blocks of 128, as an AudioWorklet would run it.
// The page runs the band beside up to six voices, so the slowest instrument must stay under 3% of
// real time and the whole band under 12%.
//
//   bun tools/band-bench.ts                 48 kHz
//   bun tools/band-bench.ts --rate 44100
import { type BandNote, INSTRUMENTS, type InstrumentId } from "../src/contract.ts";
import { createInstrument, PLAYABLE } from "../src/band/index.ts";

const flag = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const rate = Number(flag("rate", "48000"));
const SECONDS = 10;
const ids = INSTRUMENTS.map((i) => i.id) as InstrumentId[];

/**
 * A busy part: a chord a second, and with it eight notes a second running up and down. The held
 * instruments (strings, esraj) are never asked for runs, only for chords and a slow line over them.
 */
function busy(id: InstrumentId): BandNote[] {
  const [lo, hi] = PLAYABLE[id];
  const notes: BandNote[] = [];
  const clamp = (m: number) => Math.max(lo, Math.min(hi, m));
  if (id === "kit") {
    for (let i = 0; i < SECONDS * 10; i++) notes.push({ t: i * 0.1, d: 0.1, midi: [36, 42, 38, 42, 46, 45, 49, 51][i % 8], velocity: 0.7 });
  } else if (id === "tabla") {
    // a bol every eighth of a second, every fourth one on both drums
    for (let i = 0; i < SECONDS * 8; i++) {
      notes.push({ t: i / 8, d: 0.08, midi: i % 5, velocity: 0.7 });
      if (i % 4 === 0) notes.push({ t: i / 8, d: 0.08, midi: (i + 2) % 5, velocity: 0.5 });
    }
  } else if (id === "timpani") {
    for (let i = 0; i < SECONDS * 8; i++) notes.push({ t: i / 8, d: 0.1, midi: clamp(lo + [0, 5, 7, 12][i % 4]), velocity: 0.8 });
  } else if (id === "strings" || id === "esraj") {
    const mid = Math.round((lo + hi) / 2);
    for (let s = 0; s < SECONDS; s++) {
      for (const k of [-12, -5, 0, 4]) notes.push({ t: s + 0.01 * k, d: 1.1, midi: clamp(mid + k), velocity: 0.7 });
      for (let h = 0; h < 2; h++) notes.push({ t: s + h / 2, d: 0.5, midi: clamp(mid + 7 + ((s + h) * 3) % 8), velocity: 0.6 });
    }
  } else {
    const mid = Math.round((lo + hi) / 2);
    for (let s = 0; s < SECONDS; s++) for (const k of [-12, -5, 0, 4]) notes.push({ t: s + 0.01 * k, d: 1.5, midi: clamp(mid + k), velocity: 0.7 });
    for (let i = 0; i < SECONDS * 8; i++) notes.push({ t: i / 8, d: 0.25, midi: clamp(mid - 7 + ((i * 5) % 14)), velocity: 0.5 });
  }
  return notes;
}

/** Seconds of processor time for the whole ten seconds, of these instruments played together. */
function cost(which: InstrumentId[]): number {
  const players = which.map((id) => {
    const ins = createInstrument(id, rate);
    ins.perform(busy(id), 0);
    return ins;
  });
  const block = new Float32Array(128);
  const blocks = Math.ceil((SECONDS * rate) / 128);
  const began = performance.now();
  for (let b = 0; b < blocks; b++) for (const ins of players) ins.render(block);
  return (performance.now() - began) / 1000;
}

cost(ids); // warm up
let slowest = 0;
console.log(`${SECONDS} s of a busy part, ${rate} Hz, blocks of 128`);
for (const id of ids) {
  const share = Math.min(cost([id]), cost([id])) / SECONDS;
  slowest = Math.max(slowest, share);
  console.log(`  ${id.padEnd(8)} ${(100 * share).toFixed(2).padStart(6)}% of real time`);
}
const all = Math.min(cost(ids), cost(ids)) / SECONDS;
console.log(`all ${ids.length} together: ${(100 * all).toFixed(2)}%  (slowest ${(100 * slowest).toFixed(2)}%)`);
if (slowest > 0.03 || all > 0.12) console.log("over the budget: the slowest under 3%, all together under 12%");
