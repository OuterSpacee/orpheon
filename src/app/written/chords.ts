// Chords written by name, for the band parts of a song written out whole: "A:3 E7/G#:3 Bm:3",
// each a root, a kind and its beats, with the bass after "/" when it is not the root. From that,
// each chord's beats, its bass and its tones as pitch classes, moved into the key it is played in.
import type { BandNote } from "../../contract.ts";

export interface Harmony {
  /** Song beat it starts on, and its beats. */
  t: number;
  d: number;
  /** Pitch classes (0 is C): its root, its bass, its tones from the root up. */
  root: number;
  bass: number;
  tones: number[];
  /** The bass was named (an inversion, or a chord over a pedal). */
  slash: boolean;
}

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (name: string) => (STEP[name[0]] + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0) + 12) % 12;
const KINDS: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], dim7: [0, 3, 6, 9], "7b9": [0, 4, 7, 10, 1] };

/** Chords from song beat `start`, moved up by `semitones`. */
export function readChords(src: string, start: number, semitones = 0): Harmony[] {
  let t = start;
  return src
    .split(/[\s|]+/)
    .filter(Boolean)
    .map((token) => {
      const m = /^([A-G][#b]?)(m7|m|7b9|7|dim7)?(?:\/([A-G][#b]?))?:([\d.]+)$/.exec(token);
      if (!m) throw new Error(`not a chord: "${token}"`);
      const move = (pc: number) => (((pc + semitones) % 12) + 12) % 12;
      const root = move(pcOf(m[1]));
      const c: Harmony = { t, d: Number(m[4]), root, bass: m[3] ? move(pcOf(m[3])) : root, tones: KINDS[m[2] ?? ""].map((x) => (root + x) % 12), slash: !!m[3] };
      t += c.d;
      return c;
    });
}

/** The chord sounding at song beat `b` (the last one holds on). */
export const chordAt = (chords: readonly Harmony[], b: number): Harmony => chords.find((c) => b >= c.t - 1e-9 && b < c.t + c.d - 1e-9) ?? chords[chords.length - 1];

/** The pitch of class `pc` nearest `around`, inside [lo, hi]. */
export function near(pc: number, around: number, lo: number, hi: number): number {
  let best = -1;
  for (let m = lo; m <= hi; m++) if (m % 12 === pc && (best < 0 || Math.abs(m - around) < Math.abs(best - around))) best = m;
  return best;
}

/** A chord's tones as a hand plays them: `count` notes stacked up from the tone nearest `around`. */
export function voicing(c: Harmony, around: number, count: number): number[] {
  const tones = c.tones.length > 3 && count < 4 ? c.tones.filter((_, i) => i !== 2) : c.tones;
  const first = Math.min(...tones.map((pc) => near(pc, around, 0, 127)));
  const out = [first];
  for (let m = first + 1; out.length < count; m++) if (tones.includes(m % 12)) out.push(m);
  return out;
}

/** A strummed chord: its strings one after another, upward on a down stroke and downward on an up stroke. */
export function strum(into: BandNote[], t: number, notes: number[], d: number, velocity: number, up = false): void {
  (up ? [...notes].reverse() : notes).forEach((midi, k) => into.push({ t: t + 0.011 * k, d, midi, velocity: velocity * (up ? 0.85 : 1) }));
}
