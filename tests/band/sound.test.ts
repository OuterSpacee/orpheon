// What the instruments sound like, measured (nobody here can listen): pitch across each range,
// how long notes ring, the shape of each spectrum, no clicks, and levels that sit with the voice.
import { describe, expect, test } from "bun:test";
import { BODIES, INSTRUMENTS, type InstrumentId } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { SONGS, songTune, timed } from "../../src/app/songs.ts";
import { arrange } from "../../src/lang/arrange.ts";
import { cents, clickiness, frequencyNear, harmonics, hz, note, peakOf, RATE, render, slope, steadyFrequency, strength, t60 } from "./measure.ts";

/** One bowed string of the section, bowed alone: its three players sit 6 cents either side of the pitch. */
const bowedAlone = (midi: number, seconds: number, velocity = 0.7, id: InstrumentId = "strings"): Float32Array => render(id, [{ t: 0.05, d: seconds, midi, velocity }], seconds);

describe("pitch: within 5 cents after the attack, across each range", () => {
  const RANGES: [InstrumentId, number[]][] = [
    ["bass", [28, 31, 36, 40, 45, 50, 55]],
    ["harp", [24, 36, 48, 55, 60, 67, 72, 79, 84, 91, 96]],
    ["guitar", [40, 45, 50, 55, 59, 64, 69, 76, 81, 86]],
    ["piano", [21, 28, 36, 43, 48, 55, 60, 67, 72, 79, 84, 91, 96, 100]],
    ["tanpura", [36, 41, 43, 48, 50, 55, 60]],
    ["sarod", [36, 41, 48, 55, 60, 67, 72, 79, 84]],
    ["flute", [60, 62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91, 93, 96]],
    ["timpani", [38, 41, 43, 45, 48, 50, 53, 55, 57]],
  ];
  for (const [id, notes] of RANGES) {
    test(id, () => {
      const sustained = id === "flute";
      for (const midi of notes) {
        const x = note(id, midi, sustained ? 2 : 6, sustained ? 2 : 0.8);
        // after the attack: from 150 ms (a held note from half a second, past its breath's swell)
        const f = sustained ? steadyFrequency(x, RATE, hz(midi), RATE * 0.4, RATE * 1.9) : frequencyNear(x, RATE, hz(midi), RATE * 0.15, RATE * 0.75);
        const off = cents(f, hz(midi));
        if (!(Math.abs(off) < 5)) throw new Error(`${id} ${midi}: ${off.toFixed(1)} cents`);
      }
    }, 30000);
  }

  test("strings and esraj (three players, 6 cents either side)", () => {
    for (const [id, midis] of [["strings", [36, 38, 40, 43, 45, 48, 50, 52, 55, 57, 60, 64, 67, 72, 76, 79, 84, 88, 93, 96]], ["esraj", [43, 48, 55, 60, 67, 72, 79, 84]]] as [InstrumentId, number[]][]) for (const midi of midis) {
      for (const velocity of [0.45, 0.8]) {
        const x = bowedAlone(midi, 2.4, velocity, id);
        const off = cents(steadyFrequency(x, RATE, hz(midi), RATE * 0.4, RATE * 2.3), hz(midi));
        if (!(Math.abs(off) < 5)) throw new Error(`${id} ${midi} at ${velocity}: ${off.toFixed(1)} cents`);
      }
    }
  }, 60000);
});

describe("decay: notes ring as long as the real instruments' do", () => {
  // seconds to fall 60 dB, for a note left to ring (or, for the held instruments, after its end)
  const RINGS: [InstrumentId, number, number, number][] = [
    ["bass", 28, 1.5, 4],
    ["bass", 45, 0.8, 3],
    ["harp", 48, 3, 9],
    ["harp", 84, 0.8, 3],
    ["guitar", 40, 2, 6],
    ["guitar", 64, 1, 4],
    ["piano", 36, 4, 30],
    ["piano", 60, 2, 15],
    ["piano", 84, 0.5, 4],
    ["tanpura", 48, 3, 12],
    ["timpani", 45, 1.5, 4],
  ];
  for (const [id, midi, lo, hi] of RINGS) {
    test(`${id} ${midi}: ${lo} to ${hi} s`, () => {
      const x = note(id, midi, 30, Math.min(hi * 0.6, 12));
      const ring = t60(x, RATE);
      expect(ring).toBeGreaterThan(lo);
      expect(ring).toBeLessThan(hi);
    });
  }

  test("a damped note stops: bass, guitar and piano within a second of their release", () => {
    for (const id of ["bass", "guitar", "piano"] as const) {
      const x = note(id, 48, 0.3, 1.5);
      const tail = x.subarray(Math.round(0.4 * RATE));
      expect(t60(tail, RATE)).toBeLessThan(1);
    }
  });

  test("a damped string plucked again rings again", () => {
    // (it once kept its damping: the second note died as fast as the first was stopped)
    for (const id of ["bass", "guitar"] as const) {
      const x = render(id, [
        { t: 0.05, d: 0.3, midi: 45, velocity: 0.8 },
        { t: 0.6, d: 30, midi: 45, velocity: 0.8 },
      ], 3);
      expect(t60(x.subarray(Math.round(0.6 * RATE)), RATE)).toBeGreaterThan(0.8);
    }
  });

  test("the held instruments die away within a second of their release", () => {
    const strings = note("strings", 48, 1, 2.2);
    expect(t60(strings.subarray(Math.round(1.05 * RATE)), RATE)).toBeLessThan(1);
    const flute = note("flute", 72, 1, 2.2);
    expect(t60(flute.subarray(Math.round(1.05 * RATE)), RATE)).toBeLessThan(1);
  });

  const DRUMS: [InstrumentId, number, string, number, number][] = [
    ["kit", 36, "kick", 0.2, 0.8],
    ["kit", 38, "snare", 0.1, 0.5],
    ["kit", 42, "closed hi-hat", 0.02, 0.2],
    ["kit", 46, "open hi-hat", 0.3, 1.5],
    ["kit", 45, "tom", 0.3, 1],
    ["kit", 49, "crash", 1, 4],
    // the modal tabla's fundamentals fall by e in 0.45 s (tin), 0.3 s (ge) and 0.035 s (ka)
    ["tabla", 2, "tin", 1.5, 4],
    ["tabla", 0, "ge", 0.8, 3],
    ["tabla", 3, "ka", 0.05, 0.4],
  ];
  for (const [id, midi, name, lo, hi] of DRUMS) {
    test(`${name}: ${lo} to ${hi} s`, () => {
      const ring = t60(note(id, midi, 0.1, 3), RATE);
      expect(ring).toBeGreaterThan(lo);
      expect(ring).toBeLessThan(hi);
    });
  }
});

describe("spectra", () => {
  test("a plucked string: harmonics falling with their number, and the highs dying first", () => {
    for (const id of ["guitar", "harp", "bass"] as const) {
      const midi = id === "bass" ? 40 : 52;
      const x = note(id, midi, 4, 2);
      const early = harmonics(x, RATE, hz(midi), RATE * 0.1, 8192, 10);
      const late = harmonics(x, RATE, hz(midi), RATE * 1.4, 8192, 10);
      expect(slope(early)).toBeLessThan(-6);
      // the upper half of the harmonics lose more against the fundamental as the note rings
      const upper = (h: number[]) => (h[5] + h[6] + h[7] + h[8] + h[9]) / 5 - h[0];
      expect(upper(late)).toBeLessThan(upper(early) - 2);
    }
  });

  test("a bowed string: every harmonic there and held, falling as 1/k^1.7 (10 dB an octave)", () => {
    // each of the three players is a line of its own, 6 cents apart: judge the strongest of them
    const line = (x: Float32Array, f: number, at: number) => 20 * Math.log10(Math.max(...[-6, 0, 6].map((c) => strength(x, RATE, f * Math.pow(2, c / 1200), at, 16384))) + 1e-12);
    for (const midi of [45, 57, 64]) {
      const x = bowedAlone(midi, 2);
      const levels = (at: number) => Array.from({ length: 8 }, (_, k) => line(x, hz(midi) * (k + 1), at));
      const early = levels(RATE * 0.5);
      const late = levels(RATE * 1.4);
      for (let k = 1; k < 6; k++) expect(early[k] - early[0]).toBeGreaterThan(-36);
      expect(slope(early)).toBeLessThan(-6);
      expect(slope(early)).toBeGreaterThan(-14);
      // held: no partial decays
      expect(Math.abs(slope(late) - slope(early))).toBeLessThan(2);
    }
  });

  test("a tom's partials are inharmonic (Bessel), the tabla's harmonic (Raman)", () => {
    const tom = note("kit", 45, 0.1, 1);
    const f1 = 110;
    const tomAt = (r: number) => strength(tom, RATE, f1 * r, RATE * 0.06, 8192);
    expect(tomAt(1.594)).toBeGreaterThan(30 * tomAt(2));
    expect(tomAt(2.136)).toBeGreaterThan(10 * tomAt(2));
    const tin = note("tabla", 2, 0.1, 1);
    const sa = hz(60);
    const tinAt = (r: number) => strength(tin, RATE, sa * r, RATE * 0.06, 8192);
    expect(tinAt(2)).toBeGreaterThan(100 * tinAt(1.594));
    expect(tinAt(3)).toBeGreaterThan(100 * tinAt(2.296));
    // the timpani between: its partials near 1, 1.5, 2 times its note
    const timp = note("timpani", 45, 0.1, 1);
    const timpAt = (r: number) => strength(timp, RATE, hz(45) * r, RATE * 0.1, 8192);
    expect(timpAt(1.5)).toBeGreaterThan(10 * timpAt(1.25));
    expect(timpAt(1.98)).toBeGreaterThan(0.1 * timpAt(1));
  });

  test("the tanpura's drone shimmers: its high harmonics ring nearly as long as the low ones, unlike a guitar's", () => {
    const upperDrop = (id: InstrumentId, midi: number) => {
      const x = note(id, midi, 30, 4);
      const level = (at: number) => {
        const h = harmonics(x, RATE, hz(midi), RATE * at, 4096, 16);
        return Math.max(...h.slice(8, 16)) - h[0];
      };
      return level(0.3) - level(2);
    };
    expect(upperDrop("tanpura", 48)).toBeLessThan(9);
    expect(upperDrop("guitar", 48)).toBeGreaterThan(15);
  });

  test("the modal strings are clean: nothing between the harmonics", () => {
    for (const [id, midi] of [["harp", 52], ["sarod", 55], ["guitar", 52], ["bass", 40], ["tanpura", 48]] as [InstrumentId, number][]) {
      const x = note(id, midi, 30, 1.2);
      const f = hz(midi);
      const on = strength(x, RATE, f, RATE * 0.1, 16384);
      for (const r of [1.5, 2.5, 3.5, 5.5]) expect(strength(x, RATE, f * r, RATE * 0.1, 16384)).toBeLessThan(on * 0.003);
    }
  });
});

describe("no clicks", () => {
  const NOTES: [InstrumentId, number[]][] = [
    ["bass", [33, 40, 45]],
    ["harp", [48, 60, 72]],
    ["guitar", [45, 52, 64]],
    ["piano", [36, 60, 76]],
    ["strings", [48, 60, 67]],
    ["flute", [67, 74, 81]],
    ["tanpura", [43, 48, 36]],
    ["sarod", [48, 60, 72]],
    ["esraj", [48, 60, 67]],
    ["timpani", [43, 50, 45]],
  ];
  for (const [id, midis] of NOTES) {
    test(`${id}: notes start and stop without a jump`, () => {
      const notes = midis.map((midi, i) => ({ t: 0.1 + i * 0.6, d: 0.4, midi, velocity: 0.8 }));
      // and a slur: a note straight after the last, one octave up
      notes.push({ t: notes[2].t + notes[2].d, d: 0.3, midi: midis[2] + 12, velocity: 0.6 });
      const x = render(id, notes, 2.6);
      for (const n of notes) {
        expect(clickiness(x, RATE, n.t, true)).toBeLessThan(2);
        // (where the next note starts as this one ends, that start is what is heard)
        if (!notes.some((m) => Math.abs(m.t - (n.t + n.d)) < 1e-9)) expect(clickiness(x, RATE, n.t + n.d, false)).toBeLessThan(2);
      }
    });
  }

  test("more notes than voices: a voice taken over fades out first", () => {
    for (const [id, base] of [["bass", 33], ["guitar", 45], ["piano", 48], ["strings", 48], ["harp", 48]] as [InstrumentId, number][]) {
      const notes = Array.from({ length: 24 }, (_, i) => ({ t: 0.1 + i * 0.05, d: 0.8, midi: base + ((i * 5) % 19), velocity: 0.8 }));
      const x = render(id, notes, 2.2);
      for (const n of notes) expect(clickiness(x, RATE, n.t, true)).toBeLessThan(2);
    }
  });
});

test("levels: an arranged band part peaks about where a sung vowel at lungs 0.6 does", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.aim({ lungs: 0.6, glottis: 0.5, velum: 0, pitch: 196, jaw: 0.7, tongueX: 0.3, tongueY: 0.3, lips: 0.9, round: 0 });
  const sung = new Float32Array(RATE);
  voice.render(sung);
  const vowel = peakOf(sung, RATE / 2, RATE);
  const ids = INSTRUMENTS.map((i) => i.id) as InstrumentId[];
  for (const id of ["grace", "twinkle"]) {
    const song = SONGS.find((s) => s.id === id)!;
    const a = arrange(timed(songTune(song).notes), { voices: 4, band: ids });
    for (const part of a.band) {
      const end = Math.max(...part.notes.map((n) => n.t + n.d)) + 1;
      const ratio = peakOf(render(part.instrument, part.notes, end)) / vowel;
      if (!(ratio > 0.5 && ratio < 1.5)) throw new Error(`${part.instrument} in ${id}: ${ratio.toFixed(2)} times the vowel`);
    }
  }
}, 60000);
