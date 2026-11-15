// The band beside the voices, run here without a browser: the mixer, its report, and that an
// instrument starts on the same sample as a voice asked to start with the same delay. The
// instruments are stand-ins that make a known signal, so the tests do not depend on the models.
import { describe, expect, test } from "bun:test";
import type { BandNote, Instrument, InstrumentId, Score, Voice } from "../../src/contract.ts";
import { Band } from "../../src/app/audio/band.ts";
import { Choir } from "../../src/app/audio/choir.ts";
import { PACKET_SIZE, SLOT, instrumentAt, slotAt } from "../../src/app/audio/packet.ts";

/** An instrument that is silent until its notes' start, then puts out `value`. */
function standIn(value: number, told: string[] = []) {
  return (id: InstrumentId, sampleRate: number): Instrument => {
    let time = 0;
    let start = Infinity;
    return {
      sampleRate,
      get time() {
        return time;
      },
      perform(notes: BandNote[], at = time) {
        told.push(`${id} perform ${notes.length}`);
        start = at + (notes[0]?.t ?? 0);
      },
      strike: (midi, velocity) => void told.push(`${id} strike ${midi} ${velocity}`),
      hush: () => void told.push(`${id} hush`),
      render(out) {
        for (let i = 0; i < out.length; i++) out[i] = time + i / sampleRate >= start - 1e-9 ? value : 0;
        time += out.length / sampleRate;
      },
      sense(into) {
        into[0] = 0.5;
        into[63] = 9;
      },
    };
  };
}

/** A voice that is silent until its score's start, then puts out `value`. */
function voiceStandIn(value: number) {
  return (sampleRate: number): Voice => {
    let time = 0;
    let start = Infinity;
    return {
      sampleRate,
      get time() {
        return time;
      },
      setBody() {},
      aim() {},
      perform(_score: Score, at = time) {
        start = at;
      },
      hush() {},
      render(out) {
        for (let i = 0; i < out.length; i++) out[i] = time + i / sampleRate >= start - 1e-9 ? value : 0;
        time += out.length / sampleRate;
      },
      sense() {},
    };
  };
}

const settle = (band: Band, blocks = 60, n = 128) => {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < blocks; i++) {
    l.fill(0);
    r.fill(0);
    band.render(l, r);
  }
  return [l, r] as const;
};
const note: BandNote = { t: 0, d: 1, midi: 40, velocity: 1 };

describe("the band", () => {
  test("adds into the mix, at its level and place and the band's level", () => {
    const band = new Band(48000, standIn(0.5));
    band.level(1, true);
    band.add(0, "bass", 1, -1);
    band.perform(0, [note]);
    const [l, r] = settle(band);
    expect(l[127]).toBeCloseTo(0.5, 3);
    expect(r[127]).toBeCloseTo(0, 3);
    band.level(0.5);
    const [l2] = settle(band);
    expect(l2[127]).toBeCloseTo(0.25, 3);
  });

  test("adds to what the voices left in the buffers rather than replacing it", () => {
    const band = new Band(48000, standIn(0.25));
    band.level(1, true);
    band.add(2, "strings", 1, 0);
    band.perform(2, [note]);
    settle(band);
    const l = new Float32Array(128).fill(0.1);
    const r = new Float32Array(128).fill(0.1);
    band.render(l, r);
    expect(l[127]).toBeCloseTo(0.1 + 0.25 * Math.SQRT1_2, 3);
  });

  test("an instrument starts on the same sample as a voice given the same delay", () => {
    const rate = 44100;
    const choir = new Choir(rate, voiceStandIn(1));
    const band = new Band(rate, standIn(1));
    band.level(1, true);
    choir.add(0, { tract: 17, folds: 0.7 }, 1, 0);
    band.add(0, "piano", 1, 0);
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    const bl = new Float32Array(128);
    const br = new Float32Array(128);
    // Some time passes first, so the clocks are not both at zero.
    for (let i = 0; i < 37; i++) {
      choir.render(l, r);
      band.render(bl.fill(0), br.fill(0));
    }
    const delay = 0.0213;
    choir.perform(0, { phones: [], pitch: [], length: 1 }, delay);
    band.perform(0, [note], delay);
    let voiceFirst = -1;
    let bandFirst = -1;
    for (let block = 0; block < 20; block++) {
      choir.render(l, r);
      band.render(bl.fill(0), br.fill(0));
      for (let i = 0; i < 128; i++) {
        if (voiceFirst < 0 && l[i] !== 0) voiceFirst = block * 128 + i;
        if (bandFirst < 0 && bl[i] !== 0) bandFirst = block * 128 + i;
      }
    }
    expect(voiceFirst).toBeGreaterThan(0);
    expect(bandFirst).toBe(voiceFirst);
  });

  test("does not depend on the block size", () => {
    const run = (n: number) => {
      const band = new Band(48000, standIn(0.3));
      band.add(0, "harp", 0.7, 0.4);
      band.perform(0, [{ ...note, t: 0.01 }]);
      band.level(0.6);
      const out: number[] = [];
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let i = 0; i < 4096 / n; i++) {
        l.fill(0);
        r.fill(0);
        band.render(l, r);
        out.push(...l, ...r.map((x) => -x));
      }
      return out;
    };
    const small = run(128);
    const large = run(4096);
    const left = (xs: number[], n: number) => xs.filter((_, i) => i % (2 * n) < n);
    expect(left(small, 128).length).toBe(4096);
    const a = left(small, 128);
    const b = left(large, 4096);
    for (let i = 0; i < 4096; i += 97) expect(a[i]).toBeCloseTo(b[i], 6);
  });

  test("a sample that is not a number is silenced and counted", () => {
    const band = new Band(48000, standIn(Number.NaN));
    band.add(0, "kit", 1, 0);
    band.perform(0, [note]);
    const [l, r] = settle(band, 2);
    expect(Number.isFinite(l[0]) && Number.isFinite(r[0])).toBe(true);
    expect(band.faults).toBeGreaterThan(0);
  });

  test("a removed instrument fades out and frees its slot; messages reach the instrument they are for", () => {
    const told: string[] = [];
    const band = new Band(48000, standIn(0.5, told));
    band.add(0, "bass", 1, 0);
    band.add(1, "flute", 1, 0);
    band.strike(1, 72, 0.5);
    band.hush(0);
    expect(told).toEqual(["flute strike 72 0.5", "bass hush"]);
    band.remove(0);
    settle(band, 200);
    expect(band.has(0)).toBe(false);
    expect(band.has(1)).toBe(true);
    band.add(9, "bass");
    expect(band.has(9)).toBe(false);
  });

  test("reports each slot's telemetry in its place in the packet, and nothing for an empty slot", () => {
    const band = new Band(48000, standIn(0.5));
    band.add(3, "timpani", 1, 0);
    band.perform(3, [note]);
    settle(band, 10);
    const packet = new Float32Array(PACKET_SIZE);
    packet[instrumentAt(1)] = 7;
    band.report(packet);
    expect(packet[slotAt(3) + SLOT.alive]).toBe(1);
    expect(packet[slotAt(3) + SLOT.peak]).toBeCloseTo(0.5, 6);
    expect(packet[instrumentAt(3)]).toBe(0.5);
    expect(packet[instrumentAt(3) + 63]).toBe(9);
    expect(packet[slotAt(1) + SLOT.alive]).toBe(0);
    expect(packet[instrumentAt(1)]).toBe(0);
  });
});
