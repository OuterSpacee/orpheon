// The rules every instrument keeps, as the voice does: nothing allocated while
// rendering, the same samples whatever the block size, any device rate from 8 to 192 kHz
// without a NaN, the same output for the same input; and telemetry as index.ts lays it out.
import { describe, expect, test } from "bun:test";
import { heapStats } from "bun:jsc";
import { type BandNote, INSTRUMENT_TELEMETRY_SIZE, INSTRUMENTS, type InstrumentId } from "../../src/contract.ts";
import { createInstrument, PLAYABLE } from "../../src/band/index.ts";
import { peakOf, render } from "./measure.ts";

const IDS = INSTRUMENTS.map((i) => i.id) as InstrumentId[];

/** A busy phrase for each instrument: chords, repeated notes, overlaps, a note left hanging past the end. */
function phrase(id: InstrumentId): BandNote[] {
  const [lo, hi] = PLAYABLE[id];
  const notes: BandNote[] = [];
  if (id === "kit") {
    const pieces = [36, 42, 38, 42, 36, 46, 38, 44, 45, 47, 50, 49, 51, 53, 37, 40, 41, 43, 48, 57];
    pieces.forEach((midi, i) => notes.push({ t: 0.05 + i * 0.07, d: 0.1, midi, velocity: 0.4 + 0.5 * ((i * 7) % 5) / 4 }));
    return notes;
  }
  if (id === "tabla") {
    for (let i = 0; i < 24; i++) notes.push({ t: 0.05 + i * 0.06, d: 0.1, midi: i % 5, velocity: 0.5 + 0.1 * (i % 4) });
    return notes;
  }
  const mid = Math.round((lo + hi) / 2);
  const chord = [mid - 12, mid - 5, mid, mid + 4].map((m) => Math.max(lo, Math.min(hi, m)));
  chord.forEach((midi, k) => notes.push({ t: 0.05 + 0.01 * k, d: 0.5, midi, velocity: 0.7 }));
  for (let i = 0; i < 12; i++) notes.push({ t: 0.4 + i * 0.08, d: 0.15, midi: Math.max(lo, Math.min(hi, mid - 7 + ((i * 5) % 14))), velocity: 0.3 + 0.05 * i });
  notes.push({ t: 1.2, d: 5, midi: Math.max(lo, mid - 9), velocity: 0.9 });
  return notes;
}

describe("every instrument keeps the voice's rules", () => {
  for (const id of IDS) {
    test(`${id}: the same samples for any block size`, () => {
      const whole = render(id, phrase(id), 1.8, 48000, 4096);
      expect(peakOf(whole)).toBeGreaterThan(0.01);
      for (const block of [128, 1, 37, 1000]) {
        const other = render(id, phrase(id), 1.8, 48000, block);
        let differ = -1;
        for (let i = 0; i < whole.length && differ < 0; i++) if (whole[i] !== other[i]) differ = i;
        expect(differ).toBe(-1);
      }
    });

    test(`${id}: the same input, the same output`, () => {
      expect(render(id, phrase(id), 1.2)).toEqual(render(id, phrase(id), 1.2));
    });

    test(`${id}: render and sense allocate nothing`, () => {
      const ins = createInstrument(id, 48000);
      const block = new Float32Array(128);
      const tel = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
      // a long busy performance, so voices start, steal and stop while counting
      const notes: BandNote[] = [];
      for (let k = 0; k < 8; k++) for (const n of phrase(id)) notes.push({ ...n, t: n.t + 1.6 * k, d: Math.min(n.d, 1) });
      ins.perform(notes, 0);
      for (let i = 0; i < 200; i++) ins.render(block);
      ins.sense(tel);
      Bun.gc(true);
      const before = heapStats().objectCount;
      for (let i = 0; i < 2500; i++) {
        ins.render(block);
        if (i % 3 === 0) ins.sense(tel);
        if (i % 97 === 0) ins.strike(id === "kit" ? 38 : id === "tabla" ? 1 : PLAYABLE[id][0] + 12, i % 2 ? 0 : 0.6);
      }
      expect(heapStats().objectCount - before).toBeLessThan(100);
    });

    test(`${id}: no NaN, nothing past full scale, sound at every rate from 8 to 192 kHz`, () => {
      for (const rate of [8000, 11025, 16000, 22050, 44100, 48000, 96000, 192000]) {
        const out = render(id, phrase(id), 1.6, rate, 256);
        for (const v of out) if (!(v >= -1 && v <= 1)) throw new Error(`${id}: sample ${v} at ${rate} Hz`);
        expect(peakOf(out)).toBeGreaterThan(0.005);
      }
    }, 30000);

    test(`${id}: a high note let go dies away at any rate, and the next note still sounds`, () => {
      // The harp's top notes at 16 kHz grew once released (the damped loop gain passed 1), went
      // NaN and left the harp silent for the rest of the song.
      if (id === "kit" || id === "tabla") return;
      const [lo, hi] = PLAYABLE[id];
      const top = Math.min(hi - 2, 88);
      for (const rate of [8000, 11025, 16000, 22050, 48000]) {
        const notes: BandNote[] = [
          { t: 0.05, d: 0.3, midi: top, velocity: 0.8 },
          { t: 0.6, d: 0.3, midi: top, velocity: 0.8 },
          { t: 1.2, d: 0.4, midi: Math.max(lo, top - 24), velocity: 0.8 },
        ];
        const x = render(id, notes, 1.8, rate, 128);
        const at = (a: number, b: number) => peakOf(x.subarray(Math.round(a * rate), Math.round(b * rate)));
        for (const v of x) if (!Number.isFinite(v)) throw new Error(`${id}: ${v} at ${rate} Hz`);
        // nothing louder after the release than while it was held, and sound after it
        expect(at(0.45, 1.2)).toBeLessThan(1.5 * at(0.05, 0.4) + 1e-3);
        expect(at(1.2, 1.6)).toBeGreaterThan(0.002);
      }
    });

    test(`${id}: wild input never breaks it`, () => {
      const ins = createInstrument(id, 44100);
      const tel = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
      ins.perform([
        { t: 0, d: 0.1, midi: NaN, velocity: 1 },
        { t: 0, d: Infinity, midi: 60, velocity: 1 },
        { t: -1, d: 0.2, midi: 200, velocity: 2 },
        { t: 0.01, d: 0.2, midi: -40, velocity: 1 },
        { t: 0.02, d: -1, midi: 60, velocity: -1 },
        { t: 0.03, d: 0.3, midi: 1e9, velocity: 1 },
      ]);
      const block = new Float32Array(441);
      for (let i = 0; i < 60; i++) {
        if (i === 20) ins.strike(Infinity, 1);
        if (i === 30) ins.strike(30, 1);
        if (i === 40) ins.hush();
        ins.render(block);
        for (const v of block) if (!(v >= -1 && v <= 1)) throw new Error(`${id}: sample ${v}`);
        ins.sense(tel);
        for (const v of tel) if (!Number.isFinite(v)) throw new Error(`${id}: telemetry ${v}`);
      }
    });

    test(`${id}: the clock counts samples; perform at a later time; hush stops it`, () => {
      const ins = createInstrument(id, 44100);
      expect(ins.time).toBe(0);
      ins.render(new Float32Array(441));
      expect(ins.time).toBeCloseTo(0.01, 9);
      const n = phrase(id)[0];
      ins.perform([{ ...n, t: 0 }], 0.2);
      const early = new Float32Array(Math.round(0.18 * 44100));
      ins.render(early);
      expect(peakOf(early)).toBe(0);
      const late = new Float32Array(Math.round(0.2 * 44100));
      ins.render(late);
      expect(peakOf(late)).toBeGreaterThan(0.005);
      ins.hush();
      const after = new Float32Array(4410);
      ins.render(after);
      ins.render(after);
      expect(peakOf(after)).toBeLessThan(0.02);
    });

    test(`${id}: telemetry: loudness first, then the family's shape`, () => {
      const ins = createInstrument(id, 48000);
      const tel = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
      ins.sense(tel);
      expect(tel[0]).toBe(0);
      ins.perform(phrase(id).slice(0, 1), 0);
      ins.render(new Float32Array(Math.round(0.25 * 48000)));
      ins.sense(tel);
      expect(tel[0]).toBeGreaterThan(0.05);
      expect(tel[0]).toBeLessThanOrEqual(1);
      expect(tel[2]).toBe(phrase(id)[0].midi);
      expect(tel[3]).toBeCloseTo(0.2, 2);
      expect(tel[4]).toBeGreaterThan(0);
      const family = tel[1];
      if (family <= 3) {
        // a string's shape: 32 points, the largest 1
        const shape = [...tel.slice(8, 40)];
        expect(Math.max(...shape.map(Math.abs))).toBeCloseTo(1, 5);
        expect(tel[40]).toBe(phrase(id)[0].midi);
        expect(tel[41]).toBeGreaterThan(0);
      } else if (family === 4) {
        expect(Math.max(...[...tel.slice(8, 40)].map(Math.abs))).toBeCloseTo(1, 5);
        expect(tel[40]).toBeGreaterThan(0.3);
      } else {
        // a drum's modes, the largest 1, and their ratios starting from the lowest
        expect(Math.max(...tel.slice(8, 24))).toBeCloseTo(1, 5);
        expect(tel[33]).toBeGreaterThan(0);
        expect(tel[24 + tel[32]]).toBeGreaterThan(0);
      }
    });
  }
});
