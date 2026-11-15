// The critic: many plans for a song, each written out and judged, the best sung; "Try another"
// offers the next best that is most unlike those already offered.
import "../fixtures/plain-songs.ts";
import { describe, expect, test } from "bun:test";
import { SONGS, songTune, timed } from "../../src/app/songs.ts";
import { arrange } from "../../src/lang/arrange.ts";
import { choices, distance, offerOrder, shapeScore, signature, voicesScore } from "../../src/lang/critic.ts";
import type { Staging } from "../../src/lang/staging.ts";

const ARRANGED = SONGS.filter((s) => !s.band);
const staged = (id: string, variant = 0) => {
  const song = SONGS.find((s) => s.id === id)!;
  return arrange(timed(songTune(song).notes), { voices: 4, style: "staged", lyrics: song.lyrics, variant });
};

/** A plan by hand: for each phrase, who sings and who hums. */
const plan = (rows: [number[], number[]][], labels?: string[]): Staging => ({
  phrases: rows.map(([lines, hum], i) => ({ t: i, end: i + 1, label: labels?.[i] ?? String.fromCharCode(65 + i), lines, hum, texture: "all", energy: 0 })),
  story: "",
});

describe("the plans tried", () => {
  test("every mix of when, who first, humming and the lighter phrases; the arranger's first choice first", () => {
    const all = choices(4);
    expect(all.length).toBe(3 * 3 * 2 * 3);
    expect(all[0]).toEqual({ fullAt: 0.45, breather: "men-women", hum: true, order: [1, 2, 3] });
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(all.length);
  });
});

describe("the shape", () => {
  const names = ["Soprano", "Alto", "Tenor", "Bass"];
  test("one voice at a time beats all at once", () => {
    const gradual = plan([[[0], []], [[0, 1], [1]], [[0, 1, 2], [1, 2]], [[0, 1, 2, 3], []], [[0, 1, 2, 3], []], [[0, 1, 2, 3], []]]);
    const sudden = plan([[[0], []], [[0], []], [[0, 1, 2, 3], []], [[0, 1, 2, 3], []], [[0, 1, 2, 3], []], [[0, 1, 2, 3], []]]);
    expect(shapeScore(gradual, names, true)).toBeGreaterThan(shapeScore(sudden, names, true));
  });
  test("a strain sung twice running the same way twice is marked down", () => {
    const same = plan([[[0], []], [[0, 1], []], [[0, 1], []], [[0, 1, 2, 3], []]], ["A", "B", "B", "C"]);
    const grown = plan([[[0], []], [[0, 1], []], [[0, 1, 2], []], [[0, 1, 2, 3], []]], ["A", "B", "B", "C"]);
    expect(shapeScore(grown, names, false)).toBeGreaterThan(shapeScore(same, names, false));
  });
});

describe("the voices", () => {
  test("a crossing and parallel octaves cost; a clean line does not", () => {
    const tune = [60, 62, 64, 65].map((midi, i) => ({ t: i, d: 1, midi: midi + 7 }));
    const clean = [55, 57, 59, 60].map((midi, i) => ({ t: i, d: 1, midi: midi - 4 + (i % 2) }));
    const crossing = [70, 71, 72, 74].map((midi, i) => ({ t: i, d: 1, midi }));
    const octaves = tune.map((n) => ({ ...n, midi: n.midi - 12 }));
    const s = plan([[[0, 1], []]]);
    s.phrases[0].end = 4;
    const score = (alto: typeof tune) => voicesScore([{ part: "soprano", notes: tune }, { part: "alto", notes: alto }], s, 0);
    expect(score(crossing)).toBeLessThan(score(clean));
    expect(score(octaves)).toBeLessThan(score(clean));
  });
});

describe("Try another", () => {
  test("the best is sung first; the next ones are real alternatives; it wraps round", () => {
    for (const song of ARRANGED) {
      const first = staged(song.id);
      const count = first.plans!.count;
      expect(first.plans!.rank).toBe(0);
      expect(count).toBeGreaterThan(1);
      const seen = new Set<string>();
      for (let v = 0; v < Math.min(4, count); v++) seen.add(signature(staged(song.id, v).staging!));
      expect(seen.size).toBe(Math.min(4, count));
      expect(signature(staged(song.id, count).staging!)).toBe(signature(first.staging!));
    }
  });

  test("each alternative differs from the one before by more than a voice swapped, where it can", () => {
    const a = staged("plain-adeste", 0).staging!;
    const b = staged("plain-adeste", 1).staging!;
    expect(distance(a, b)).toBeGreaterThanOrEqual(0.4);
  });

  test("the order offered: the best first, then the best of what is most unlike it", () => {
    const x = plan([[[0], []], [[0, 1], []]]);
    const y = plan([[[0], []], [[0, 2], []]]);
    const z = plan([[[0, 1], []], [[0, 1, 2], [1]]]);
    const order = offerOrder([
      { staging: y, score: 1 },
      { staging: x, score: 2 },
      { staging: z, score: 0.9 },
    ]);
    expect(order[0].staging).toBe(x);
    expect(order[1].staging).toBe(z);
  });
});
