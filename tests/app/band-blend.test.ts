// The band under a choir, as the page plans it: it plays the chords the choir sings (a round's
// and a written harmony's too), opens with the tune's last phrase while the voices wait, grows
// from sparse to full, keeps its held chords under the tune, rings after the voices stop, and sits
// under the voices (rendered and measured, as an accompanist's level).
//
// Before this, the band's chords were guessed from the tune alone: in the round 21% of the
// moments where a band note was struck rubbed a semitone against a sung note, and every
// instrument sat 2 to 4 dB under the voice carrying the tune.
import "../fixtures/plain-songs.ts";
import { beforeAll, describe, expect, test } from "bun:test";
import { BODIES, type InstrumentId } from "../../src/contract.ts";
import { ready } from "../../src/lang/index.ts";
import { createVoice } from "../../src/voice/index.ts";
import { createInstrument } from "../../src/band/index.ts";
import { BODY_NAMES } from "../../src/app/bodies.ts";
import { lineup, performance } from "../../src/app/sing/plan.ts";
import { setupPatch } from "../../src/app/sing/setup.ts";
import { SONGS } from "../../src/app/songs.ts";
import { INITIAL } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";

beforeAll(async () => {
  await ready("en");
});

/** A song sung by the choir with its band: the suggested one, or these instruments. */
function withBand(song: string, instruments: InstrumentId[] | null = null): State {
  const s: State = { ...INITIAL, mode: "sing", song };
  return { ...s, ...setupPatch(s, { choir: true, band: true, voices: 4, instruments }) };
}

const DRUMS = new Set<InstrumentId>(["kit", "tabla"]);
const beatOf = (song: string) => 60 / SONGS.find((x) => x.id === song)!.bpm;

/** The share of quarter beats where a band note in its first beat is a semitone (or a major seventh) from a sung note. */
function rubs(song: string, instruments: InstrumentId[] | null = null): number {
  const lu = lineup(withBand(song, instruments))!;
  const beat = beatOf(song);
  const sung = lu.lines.flatMap((l) => l.notes);
  const struck = lu.band.filter((p) => !DRUMS.has(p.instrument)).flatMap((p) => p.notes);
  const from = Math.min(...sung.map((n) => n.t));
  const to = Math.max(...sung.map((n) => n.t + n.d));
  let steps = 0;
  let bad = 0;
  for (let t = from; t < to; t += beat / 4) {
    const v = sung.filter((n) => n.t <= t && t < n.t + n.d).map((n) => n.midi);
    const b = struck.filter((n) => n.t <= t && t < n.t + Math.min(n.d, beat)).map((n) => n.midi);
    if (!v.length || !b.length) continue;
    steps++;
    if (v.some((x) => b.some((y) => [1, 11].includes(Math.abs(x - y) % 12)))) bad++;
  }
  return bad / steps;
}

describe("the band under a choir", () => {
  test("plays the chords the choir sings: a round, and a harmony written out", () => {
    expect(rubs("jacques")).toBeLessThan(0.03);
    expect(rubs("old100")).toBeLessThan(0.06);
    for (const song of ["twinkle", "plain-grace", "plain-adeste", "joy"]) expect(rubs(song, ["bass", "strings", "harp", "piano"])).toBeLessThan(0.08);
  });

  test("opens with the tune's last phrase on its lead instrument, and the voices wait for it", () => {
    const plain = lineup({ ...withBand("twinkle"), setups: { twinkle: { choir: true, band: false } } })!;
    const lu = lineup(withBand("twinkle", ["harp", "bass"]))!;
    const firstSung = (l: typeof lu) => Math.min(...l.lines.map((x) => x.notes[0].t));
    const moved = firstSung(lu) - firstSung(plain);
    const bar = 4 * beatOf("twinkle");
    // two to four bars of introduction
    expect(moved).toBeGreaterThan(2 * bar - 0.5);
    expect(moved).toBeLessThan(4 * bar + 0.5);
    // every line moves together, and the piano roll with them
    lu.lines.forEach((l, i) => expect(l.notes[0].t - plain.lines[i].notes[0].t).toBeCloseTo(moved, 6));
    expect(lu.notes[0].t - plain.notes[0].t).toBeCloseTo(moved, 6);
    // the harp plays "D D C" (the last bar of the tune) as the introduction's last notes, an octave or two up
    const harp = lu.band.find((p) => p.instrument === "harp")!;
    const intro = harp.notes.filter((n) => n.t < firstSung(lu) - 0.01);
    expect(intro.length).toBeGreaterThan(4);
    const tuneEnd = plain.lines[0].notes.slice(-3).map((n) => n.midi % 12);
    const introEnd = intro.slice(-3).map((n) => n.midi % 12);
    expect(introEnd).toEqual(tuneEnd);
    // and the band's first note is near the start
    expect(Math.min(...lu.band.flatMap((p) => p.notes.map((n) => n.t)))).toBeLessThan(0.5);
  });

  test("a choir written out gets the introduction too, and the band off puts the voices back", () => {
    const plain = lineup({ ...withBand("old100"), setups: { old100: { choir: true, band: false } } })!;
    const lu = lineup(withBand("old100"))!;
    expect(lu.lines[0].notes[0].t).toBeGreaterThan(plain.lines[0].notes[0].t + 2);
    expect(plain.band).toEqual([]);
    expect(plain.lines[0].notes[0].t).toBeLessThan(1);
  });

  test("grows: the harp plays fewer notes a bar in the first phrase than in the last verse", () => {
    const lu = lineup(withBand("joy", ["harp"]))!;
    const harp = lu.band[0].notes;
    const bar = 4 * beatOf("joy");
    const sung = lu.lines[0].notes;
    const first = sung[0].t;
    const end = Math.max(...sung.map((n) => n.t + n.d));
    // strokes, not notes: a rolled chord (its notes 60 ms apart) is one
    const strokes = (a: number, b: number) => harp.filter((n, i) => n.t >= a && n.t < b && (i === 0 || n.t - harp[i - 1].t > 0.1)).length;
    const perBar = (a: number, b: number) => strokes(a, b) / ((b - a) / bar);
    expect(perBar(first, first + 2 * bar)).toBeLessThan(0.6 * perBar(end - 5 * bar, end - bar));
  });

  test("the drums wait for the second phrase", () => {
    const lu = lineup(withBand("joy", ["kit", "bass"]))!;
    const kit = lu.band.find((p) => p.instrument === "kit")!.notes;
    const first = lu.lines[0].notes[0].t;
    const bar = 4 * beatOf("joy");
    // nothing but, at most, a fill in the bar before the second phrase
    expect(kit.filter((n) => n.t < first + bar).length).toBe(0);
    expect(kit.length).toBeGreaterThan(20);
  });

  test("holds its chords under the tune", () => {
    for (const song of ["twinkle", "plain-grace", "joy", "plain-adeste"]) {
      const lu = lineup(withBand(song, ["strings"]))!;
      const tune = lu.lines[0].notes;
      const strings = lu.band[0].notes;
      for (const n of strings) {
        const over = tune.filter((x) => x.t < n.t + n.d - 0.05 && x.t + x.d > n.t + 0.05);
        if (over.length) expect(n.midi).toBeLessThan(Math.min(...over.map((x) => x.midi)));
      }
    }
  });

  test("ends together: the last chord rings after the voices stop", () => {
    const lu = lineup(withBand("plain-grace", ["harp", "bass", "strings"]))!;
    const sungEnd = Math.max(...lu.lines.flatMap((l) => l.notes.map((n) => n.t + n.d)));
    for (const part of lu.band) {
      const end = Math.max(...part.notes.map((n) => n.t + n.d));
      expect(end).toBeGreaterThan(sungEnd + 1);
    }
  });
});

describe("the balance, rendered", () => {
  const RATE = 16000;

  /** A part's level while it sounds (20 ms frames above -60 dB: its rests don't count). */
  function sounding(x: Float32Array): number {
    const hop = Math.round(0.02 * RATE);
    let sum = 0;
    let count = 0;
    for (let i = 0; i + hop <= x.length; i += hop) {
      let e = 0;
      for (let j = i; j < i + hop; j++) e += x[j] * x[j];
      if (e / hop > 1e-6) {
        sum += e;
        count += hop;
      }
    }
    return count ? Math.sqrt(sum / count) : 0;
  }
  const db = (x: number) => 20 * Math.log10(x);

  const DRONE: InstrumentId[] = ["tanpura", "sarod", "esraj", "tabla"];
  const CASES: [string, InstrumentId[] | null][] = [["old100", null], ["twinkle", null], ["old100", DRONE], ["twinkle", DRONE]];
  for (const [song, instruments] of CASES) {
    test(`${song}${instruments ? " with the drone band" : ""}: each instrument well under the tune's voice, the band under the choir`, () => {
      const s = withBand(song, instruments);
      const p = performance(lineup(s)!, s).performance;
      const end = Math.max(...p.parts.map((x) => x.score.length), ...(p.band ?? []).flatMap((b) => b.notes.map((n) => n.t + n.d))) + 0.5;
      const length = Math.round(end * RATE);
      const render = (make: () => { render(out: Float32Array): void }) => {
        const x = new Float32Array(length);
        const it = make();
        for (let k = 0; k < length; k += 128) it.render(x.subarray(k, Math.min(length, k + 128)));
        return x;
      };
      const voices = p.parts.map((part) =>
        sounding(render(() => {
          const v = createVoice(RATE, BODIES[BODY_NAMES[part.body]]);
          v.perform(part.score, 0);
          return v;
        })) * part.level,
      );
      const band = (p.band ?? []).map((part) =>
        sounding(render(() => {
          const ins = createInstrument(part.instrument, RATE);
          ins.perform(part.notes, 0);
          return ins;
        })) * part.level * s.bandLevel,
      );
      const power = (xs: number[]) => xs.reduce((sum, x) => sum + x * x, 0);
      // the hand-mixed choir videos sat their bands 7 to 9 dB under the choir; allow either side
      const whole = db(Math.sqrt(power(band) / power(voices)));
      expect(whole).toBeLessThan(-5);
      expect(whole).toBeGreaterThan(-14);
      for (const b of band) expect(db(b / voices[0])).toBeLessThan(-5);
    }, 60000);
  }
});
