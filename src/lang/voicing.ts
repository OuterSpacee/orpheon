/**
 * Parts under a tune: alto, tenor and bass (and a descant over it) on the chords harmony.ts
 * found, written the way a harmony textbook teaches four-part writing (for example Piston,
 * "Harmony", 1941, chs. 3–5; Aldwell & Schachter, "Harmony and Voice Leading", 1978):
 *
 *   - every voice in its range, no voice crossing another, no more than an octave between
 *     neighbouring upper voices;
 *   - root and third present; the root doubled before the fifth, the fifth before the third,
 *     never the leading tone or a seventh;
 *   - no parallel (or contrary) fifths or octaves between any two voices; no hidden fifths or
 *     octaves into the outer voices when the top voice leaps;
 *   - common tones held, inner voices moving by step where they can, the leading tone rising
 *     and a seventh falling.
 *
 * The rules are costs (a forbidden thing costs far more than anything else), and one best path
 * through every possible voicing of every chord (dynamic programming) picks the parts. The
 * tune is fixed: it is the soprano.
 */
import type { NoteIn } from "./index.ts";
import { type Chord, pc } from "./harmony.ts";

/** One moment the lower parts sound together: their pitches are chosen together. */
export interface Moment {
  t: number;
  d: number;
  chord: Chord;
  /** the tune's note when the moment starts, and the one sounding just before it (null in a rest) */
  top: number | null;
  topBefore: number | null;
  /** the lowest and highest the tune goes while the moment lasts (a held part must stay under it, a descant over it) */
  topLow: number | null;
  topHigh: number | null;
  /** the parts keep their notes from the moment before (the tune passes through a note outside the chord) */
  hold: boolean;
  /** the parts were silent just before this moment */
  fresh: boolean;
}

export type PartName = "alto" | "tenor" | "bass";

export const RANGES: Record<PartName | "soprano" | "descant", [number, number]> = {
  descant: [64, 81],
  soprano: [60, 79],
  alto: [55, 74],
  tenor: [48, 67],
  bass: [40, 62],
};
const CENTRE: Record<PartName | "descant", number> = { descant: 74, alto: 64, tenor: 57, bass: 48 };

const FORBIDDEN = 50;
/** a gap shorter than this between two notes is no rest: the parts move from one to the other */
export const BREATH = 0.1;

type State = number[];

/** Is this interval (in semitones, upper minus lower) a perfect fifth or octave (or unison)? */
const perfect = (i: number): boolean => i >= 0 && (i % 12 === 0 || i % 12 === 7);

/** Cost of one voicing on its own. `parts` are top-down pitches of the lower parts. */
function standing(parts: State, names: readonly PartName[], m: Moment, leading: number): number {
  const tones = m.chord.tones;
  const top = m.top;
  let cost = 0;
  const all = top === null ? parts : [top, ...parts];
  const count = new Array(tones.length).fill(0);
  for (const p of all) {
    const at = tones.indexOf(pc(p));
    if (at >= 0) count[at]++;
  }
  if (names.length >= 2) {
    if (count[0] === 0) cost += 8;
    if (count[1] === 0) cost += 3;
    if (tones.length > 2 && count[2] === 0) cost += 0.3;
  }
  if (count[1] > 1 && names.length >= 3) cost += 0.4;
  if (tones.length > 3 && count[3] > 1) cost += 3;
  let lead = 0;
  for (const p of all) if (pc(p) === leading) lead++;
  if (lead > 1) cost += 3;
  // spacing and unisons
  for (let i = 0; i < all.length - 1; i++) {
    const gap = all[i] - all[i + 1];
    const lowerIsBass = i + 1 === all.length - 1 && names[names.length - 1] === "bass";
    if (gap > (lowerIsBass ? 19 : 12)) cost += lowerIsBass ? 1 : 3;
    if (gap === 0) cost += lowerIsBass ? 1 : 0.6;
  }
  names.forEach((name, i) => (cost += 0.04 * Math.abs(parts[i] - CENTRE[name])));
  // bass on the root; the third (first inversion) now and then
  if (names[names.length - 1] === "bass" && pc(parts[parts.length - 1]) !== m.chord.root) cost += 0.7;
  return cost;
}

/** Cost of moving from one voicing to the next. */
function moving(a: State, b: State, names: readonly PartName[], from: Moment, to: Moment, tonic: number, leading: number): number {
  let cost = 0;
  const n = names.length;
  for (let i = 0; i < n; i++) {
    const step = Math.abs(b[i] - a[i]);
    if (names[i] === "bass") cost += step === 0 ? 0 : step <= 7 ? 0.08 * step : step <= 12 ? 1 + 0.05 * step : 5;
    else cost += step === 0 ? (to.chord !== from.chord ? -0.2 : 0) : step <= 2 ? 0.1 : step <= 4 ? 0.7 : step === 5 ? 1.4 : step <= 7 ? 2.5 : 5 + step;
  }
  // after a breath the parts may start anywhere; a small move is still nicer
  if (to.fresh) return 0.3 * cost;
  // all the voices, the tune on top when it sounds on both sides
  const tuned = from.top !== null && to.topBefore !== null && to.top !== null;
  const before = tuned ? [to.topBefore as number, ...a] : a;
  const after = tuned ? [to.top as number, ...b] : b;
  const k = before.length;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const mi = after[i] - before[i];
      const mj = after[j] - before[j];
      if (mi === 0 || mj === 0) continue;
      const i0 = before[i] - before[j];
      const i1 = after[i] - after[j];
      if (perfect(i0) && perfect(i1) && i0 % 12 === i1 % 12) cost += FORBIDDEN;
      // hidden fifths and octaves into the outer voices, when the top voice leaps
      if (i === 0 && j === k - 1 && tuned && Math.sign(mi) === Math.sign(mj) && perfect(i1) && Math.abs(mi) > 2) cost += 1;
    }
    // overlap: a voice moving past where its neighbour just was
    if (i + 1 < k && (after[i + 1] > before[i] || after[i] < before[i + 1])) cost += 1;
  }
  // tendencies: the leading tone rises to the tonic, a seventh falls by step
  const resolving = (from.chord.roman === "V" || from.chord.roman === "V7") && (to.chord.roman === "I" || to.chord.roman === "i" || to.chord.roman === "vi" || to.chord.roman === "VI");
  for (let i = 0; i < n; i++) {
    if (resolving && pc(a[i]) === leading && pc(b[i]) !== tonic) cost += names[i] === "bass" ? 0 : 0.8;
    if (from.chord.tones.length > 3 && pc(a[i]) === from.chord.tones[3] && !(b[i] - a[i] < 0 && b[i] - a[i] >= -2)) cost += 0.8;
  }
  return cost;
}

/** Every voicing of a moment's chord for these parts. */
function voicings(m: Moment, names: readonly PartName[]): State[] {
  const tones = m.chord.tones;
  const options = names.map((name) => {
    const [lo, hi] = RANGES[name];
    const out: number[] = [];
    for (let p = lo; p <= hi; p++) {
      if (m.topLow !== null && p > m.topLow) continue;
      const at = tones.indexOf(pc(p));
      if (at < 0) continue;
      // the bass takes the root, or the third of a triad
      if (name === "bass" && !(at === 0 || (at === 1 && tones.length === 3))) continue;
      out.push(p);
    }
    return out;
  });
  const states: State[] = [];
  const build = (i: number, acc: number[]): void => {
    if (i === names.length) {
      states.push(acc.slice());
      return;
    }
    for (const p of options[i]) {
      if (i > 0 && p > acc[i - 1]) continue; // no crossing
      acc.push(p);
      build(i + 1, acc);
      acc.pop();
    }
  };
  build(0, []);
  return states;
}

/**
 * The lower parts' pitches at every moment (null where a part does not sound), chosen as one
 * best path. `names` are top-down, any of alto, tenor, bass.
 */
export function voiceParts(moments: readonly Moment[], names: readonly PartName[], tonic: number): number[][] {
  if (!names.length || !moments.length) return moments.map(() => []);
  const leading = (tonic + 11) % 12;
  const layers: { states: State[]; score: Float64Array; back: Int32Array }[] = [];
  moments.forEach((m, e) => {
    const prev = layers[e - 1];
    let states: State[];
    if (m.hold && prev) {
      states = prev.states;
      const score = Float64Array.from(prev.score);
      const back = Int32Array.from(states, (_, i) => i);
      layers.push({ states, score, back });
      return;
    }
    states = voicings(m, names);
    if (!states.length) states = [names.map((name) => Math.min(RANGES[name][1], m.topLow ?? 127))];
    const score = new Float64Array(states.length);
    const back = new Int32Array(states.length).fill(-1);
    states.forEach((st, i) => {
      const own = standing(st, names, m, leading);
      if (!prev) {
        score[i] = own;
        return;
      }
      let best = Infinity;
      let arg = 0;
      for (let j = 0; j < prev.states.length; j++) {
        const s = prev.score[j] + moving(prev.states[j], st, names, moments[e - 1], m, tonic, leading);
        if (s < best) {
          best = s;
          arg = j;
        }
      }
      score[i] = best + own;
      back[i] = arg;
    });
    layers.push({ states, score, back });
  });
  const last = layers[layers.length - 1];
  let at = 0;
  for (let i = 1; i < last.score.length; i++) if (last.score[i] < last.score[at]) at = i;
  const out: number[][] = new Array(moments.length);
  for (let e = moments.length - 1; e >= 0; e--) {
    out[e] = layers[e].states[at];
    at = layers[e].back[at];
    if (at < 0) at = 0;
  }
  return out;
}

/**
 * A part over the tune: chord tones a third to an octave above it, moving by step where it can,
 * kept clear of fifths and octaves with every other part. `others[e]` are the other parts'
 * pitches at moment e, top-down, the tune first.
 */
export function voiceDescant(moments: readonly Moment[], others: readonly (number | null)[][]): (number | null)[] {
  const [lo, hi] = RANGES.descant;
  const layers: { states: number[]; score: Float64Array; back: Int32Array }[] = [];
  moments.forEach((m, e) => {
    const top = m.top;
    const tones = m.chord.tones;
    const prev = layers[e - 1];
    let states: number[] = [];
    if (m.hold && prev) states = prev.states;
    else
      for (let p = lo; p <= hi; p++) {
        if (tones.indexOf(pc(p)) < 0) continue;
        if (top !== null && (p < (m.topHigh ?? top) + 3 || p > top + 12)) continue;
        states.push(p);
      }
    // a tune that climbs high within the moment: the descant only has to stay over it
    if (!states.length && top !== null) for (let p = m.topHigh ?? top; p <= hi; p++) if (tones.indexOf(pc(p)) >= 0) states.push(p);
    if (!states.length) states = [Math.min(hi, m.topHigh ?? hi)];
    const score = new Float64Array(states.length);
    const back = new Int32Array(states.length).fill(-1);
    states.forEach((d, i) => {
      const own = 0.04 * Math.abs(d - CENTRE.descant) + (top !== null && pc(d) === pc(top) ? 0.3 : 0);
      if (!prev) {
        score[i] = own;
        return;
      }
      let best = Infinity;
      let arg = 0;
      prev.states.forEach((d0, j) => {
        if (m.hold) {
          if (j !== i) return;
          if (prev.score[j] < best) {
            best = prev.score[j];
            arg = j;
          }
          return;
        }
        const step = Math.abs(d - d0);
        let c = step === 0 ? 0.1 : step <= 2 ? 0 : step <= 4 ? 0.5 : step <= 7 ? 1.5 : 4;
        // the other parts just before this moment: the tune's note then, the lower parts' last ones
        const was = [m.topBefore, ...others[e - 1].slice(1)];
        const now = others[e];
        for (let k = 0; k < now.length; k++) {
          const x0 = was[k];
          const x1 = now[k];
          if (x0 === null || x1 === null || m.fresh) continue;
          if (x1 - x0 === 0 || d - d0 === 0) continue;
          const i0 = d0 - x0;
          const i1 = d - x1;
          if (perfect(i0) && perfect(i1) && i0 % 12 === i1 % 12) c += FORBIDDEN;
        }
        // the tune must not rise past where the descant just was, nor the descant drop under the tune before
        if (top !== null && m.topBefore !== null && (top > d0 || d < m.topBefore)) c += 1;
        const s = prev.score[j] + c;
        if (s < best) {
          best = s;
          arg = j;
        }
      });
      score[i] = best + own;
      back[i] = arg;
    });
    layers.push({ states, score, back });
  });
  const last = layers[layers.length - 1];
  let at = 0;
  for (let i = 1; i < last.score.length; i++) if (last.score[i] < last.score[at]) at = i;
  const out: (number | null)[] = new Array(moments.length);
  for (let e = moments.length - 1; e >= 0; e--) {
    out[e] = layers[e].states[at];
    at = layers[e].back[at];
    if (at < 0) at = 0;
  }
  return out;
}

// ──────────────────────────────────────────────────────── the check ──

/** What is wrong with a set of parts, as sentences: crossings and parallel fifths or octaves. Parts are top-down. */
export function voiceLeadingProblems(parts: readonly { name: string; notes: readonly NoteIn[] }[]): string[] {
  const times = [...new Set(parts.flatMap((p) => p.notes.map((n) => Math.round(n.t * 1e6) / 1e6)))].sort((a, b) => a - b);
  const sounding = (notes: readonly NoteIn[], t: number): number | null => {
    for (const n of notes) if (n.t <= t + 1e-6 && t < n.t + n.d - 1e-6) return Math.round(n.midi);
    return null;
  };
  // the note a part was singing just before t: one that ends within a breath of it (across a
  // rest there is no motion, so no parallels)
  const justBefore = (notes: readonly NoteIn[], t: number): number | null => {
    let found: number | null = null;
    for (const n of notes) if (n.t < t - 1e-6 && n.t + n.d > t - BREATH) found = Math.round(n.midi);
    return found;
  };
  const out: string[] = [];
  for (const t of times) {
    const now = parts.map((p) => sounding(p.notes, t));
    const before = parts.map((p) => justBefore(p.notes, t));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const hi = now[i];
        const lo = now[j];
        if (hi !== null && lo !== null && hi < lo) out.push(`${parts[i].name} crosses under ${parts[j].name} at ${t.toFixed(2)} s`);
        const hi0 = before[i];
        const lo0 = before[j];
        if (hi === null || lo === null || hi0 === null || lo0 === null) continue;
        const mi = hi - hi0;
        const mj = lo - lo0;
        if (mi === 0 || mj === 0 || Math.sign(mi) !== Math.sign(mj)) continue;
        const i0 = hi0 - lo0;
        const i1 = hi - lo;
        if (perfect(i0) && perfect(i1) && i0 % 12 === i1 % 12) out.push(`parallel ${i1 % 12 === 7 ? "fifths" : "octaves"} between ${parts[i].name} and ${parts[j].name} at ${t.toFixed(2)} s`);
      }
    }
  }
  return out;
}
