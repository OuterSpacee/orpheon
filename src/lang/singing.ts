/**
 * Syllables onto notes, and the sung Score: the phones in their slots, the pitch line, the
 * vibrato curve and the words for captions.
 *
 * The timing follows the contract's slot rules (contract.ts, Phone):
 *   - a syllable's vowel starts exactly when its note starts;
 *   - the consonants before it take their time from the end of the note before (or from the
 *     rest before it), so they are heard before the beat and the vowel lands on it;
 *   - the consonants after it sit at the end of its last note;
 *   - a long note holds the vowel's main quality; a diphthong glides to its second quality only
 *     near the end;
 *   - a note with no new syllable (a "_" in the lyrics) carries on the same vowel at the new
 *     pitch, and the syllable's closing consonants move to the end of that note.
 * Where the tune rests long enough the singer rests too ("_", a breath).
 */
import type { NoteIn } from "./index.ts";
import type { Phone, PhoneSymbol, Point, Score, Word } from "../contract.ts";
import { sungConsonant } from "./durations.ts";
import type { Seg, Syl } from "./phones.ts";

/** One thing the lyrics put on a note: a syllable, or "hold the one before". */
export type Unit = { kind: "syl"; syl: Syl; word: number; text: string; /** a second word sung on the same note (two syllables merged) */ also?: number } | { kind: "hold" };

export interface SingSettings {
  /** vibrato depth in cents on held notes */
  vibrato: number;
  transpose: number;
  /** the syllable sung when the lyrics run out */
  filler: () => Syl;
  /** the words, by the `word` index of their units, for captions */
  words: string[];
}

/** Default vibrato depth in cents: a trained singer is around 35. */
export const DEFAULT_VIBRATO = 30;

/** "la", sung when the words run out */
export const la = (): Syl => ({ onset: [{ ph: "l" }], nucleus: [{ ph: "a" }], coda: [], stress: 1 });

/** a gap between notes shorter than this is sung through (legato); longer, the singer rests */
const REST_GAP = 0.12;
/** the shortest bit of vowel a note keeps when its neighbours' consonants crowd it */
const MIN_VOWEL = 0.04;
/** a vowel's glide to its second quality, at most */
const GLIDE = 0.12;
/** how long the pitch takes to move from note to note */
const SLIDE_BEFORE = 0.04;
const SLIDE_AFTER = 0.03;
/** vibrato waits this long into a note, then grows over the next stretch */
const VIBRATO_WAIT = 0.2;
const VIBRATO_GROW = 0.4;
/** notes shorter than this get no vibrato */
const VIBRATO_MIN = 0.35;
/** silence after the last note */
const TAIL = 0.3;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** one syllable spread over a run of notes */
interface Run {
  syl: Syl;
  word: number;
  also?: number;
  /** first and last note it is sung on */
  first: number;
  last: number;
}

/** Notes in time order, none overlapping the next, none empty. */
export function cleanNotes(notes: readonly NoteIn[]): NoteIn[] {
  const sorted = notes.filter((n) => n.d > 0 && Number.isFinite(n.t) && Number.isFinite(n.midi)).map((n) => ({ ...n })).sort((a, b) => a.t - b.t);
  const out: NoteIn[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && n.t < prev.t + 0.01) continue; // two notes at once: one voice sings the first
    if (prev && prev.t + prev.d > n.t) prev.d = n.t - prev.t;
    out.push(n);
  }
  return out;
}

const segDur = (s: Seg): number => sungConsonant(s.ph, s.long);

export function singUnits(rawNotes: readonly NoteIn[], units: readonly Unit[], o: SingSettings): Score {
  const notes = cleanNotes(rawNotes);
  if (notes.length === 0) return { phones: [], pitch: [], length: 0 };

  // which syllable each note sings
  const runs: Run[] = [];
  let u = 0;
  for (let i = 0; i < notes.length; i++) {
    const unit = units[u++];
    const prev = runs[runs.length - 1];
    if (unit?.kind === "hold" && prev && prev.last === i - 1) prev.last = i;
    else if (unit?.kind === "syl") runs.push({ syl: unit.syl, word: unit.word, also: unit.also, first: i, last: i });
    else runs.push({ syl: o.filler(), word: -1, first: i, last: i });
  }

  const start = (r: Run) => notes[r.first].t;
  const end = (r: Run) => notes[r.last].t + notes[r.last].d;

  // where each run's vowel may end (its coda begins) and where the next onset begins
  const onsetLen = runs.map((r) => r.syl.onset.reduce((s, c) => s + segDur(c), 0));
  const codaLen = runs.map((r) => r.syl.coda.reduce((s, c) => s + segDur(c), 0));
  /** scale of the consonants at each border (1 = their own length) */
  const onsetScale = runs.map(() => 1);
  const codaScale = runs.map(() => 1);
  /** where each coda ends */
  const codaEnd = runs.map(end);

  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    const next = runs[k + 1];
    const prev = runs[k - 1];
    if (!prev) {
      // the first onset has from the score's start to the note
      const room = start(r);
      if (onsetLen[k] > room) onsetScale[k] = room / onsetLen[k];
    }
    const vowelFloor = notes[r.last].t + Math.min(MIN_VOWEL, notes[r.last].d * 0.5);
    if (next) {
      const gap = start(next) - end(r);
      if (gap < REST_GAP || gap < onsetLen[k + 1]) {
        // the coda and the next onset share the time between this vowel's floor and the next vowel
        const room = start(next) - vowelFloor;
        const need = codaLen[k] + onsetLen[k + 1];
        if (need > room && need > 0) {
          const s = Math.max(0, room) / need;
          codaScale[k] = s;
          onsetScale[k + 1] = s;
        }
        const nextOnset = start(next) - onsetLen[k + 1] * onsetScale[k + 1];
        // sung through: the coda moves up against the next onset, so the vowel lasts to it
        codaEnd[k] = gap < REST_GAP ? nextOnset : Math.min(end(r), nextOnset);
      }
      // else a rest: the coda closes the note, the next onset waits in the rest
    }
    // a coda longer than its note leaves the vowel its floor
    if (codaEnd[k] - codaLen[k] * codaScale[k] < vowelFloor && codaLen[k] > 0) codaScale[k] = Math.max(0, codaEnd[k] - vowelFloor) / codaLen[k];
  }

  const phones: Phone[] = [];
  const push = (ph: PhoneSymbol, t: number, d: number, stress?: 0 | 1 | 2) => {
    if (d <= 1e-4) return;
    const last = phones[phones.length - 1];
    // rounding must not make two slots overlap: the earlier one gives way, so a vowel's start
    // stays exactly on its note
    if (last && t < last.t + last.d) {
      last.d = t - last.t;
      if (last.d <= 1e-4) phones.pop();
    }
    phones.push(stress === undefined ? { ph, t, d } : { ph, t, d, stress });
  };
  const wordSpan = new Map<number, [number, number]>();

  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    const s = r.syl;
    const vowelStart = start(r);
    // onset, ending exactly on the beat
    const onsetStart = vowelStart - onsetLen[k] * onsetScale[k];
    const prevEnd = phones.length ? phones[phones.length - 1].t + phones[phones.length - 1].d : 0;
    if (onsetStart - prevEnd >= 0.05) push("_", prevEnd, onsetStart - prevEnd);
    let t = onsetStart;
    for (const c of s.onset) {
      const d = segDur(c) * onsetScale[k];
      push(c.ph, t, d, s.stress);
      t += d;
    }
    // the vowel lands on the note (whatever the sums above rounded to)
    t = vowelStart;
    const codaStart = codaEnd[k] - codaLen[k] * codaScale[k];
    const vowelEnd = Math.max(codaStart, vowelStart + 0.01);
    const nucleus = s.nucleus.length ? s.nucleus : [{ ph: "ə" as PhoneSymbol }];
    if (nucleus.length >= 2) {
      const span = vowelEnd - vowelStart;
      const glide = span > 0.4 ? GLIDE : span * 0.3;
      push(nucleus[0].ph, vowelStart, span - glide, s.stress);
      push(nucleus[1].ph, vowelEnd - glide, glide, s.stress);
    } else push(nucleus[0].ph, vowelStart, vowelEnd - vowelStart, s.stress);
    t = vowelEnd;
    for (const c of s.coda) {
      const d = segDur(c) * codaScale[k];
      push(c.ph, t, d, s.stress);
      t += d;
    }
    for (const w of [r.word, r.also ?? -1]) {
      if (w < 0) continue;
      const span = wordSpan.get(w);
      wordSpan.set(w, [span ? span[0] : onsetStart, t]);
    }
  }
  const lastEnd = phones[phones.length - 1].t + phones[phones.length - 1].d;
  push("_", lastEnd, TAIL);
  const length = lastEnd + TAIL;

  // pitch: each note's pitch, sliding briefly from the one before when sung through
  const pitch: Point[] = [];
  const p = (i: number) => hz(notes[i].midi + o.transpose);
  const onsetOf = new Map<number, number>();
  runs.forEach((r, k) => onsetOf.set(r.first, start(r) - onsetLen[k] * onsetScale[k]));
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const prev = notes[i - 1];
    const sungThrough = prev && n.t - (prev.t + prev.d) < REST_GAP;
    if (!prev) pitch.push({ t: 0, v: p(i) });
    else if (sungThrough) {
      pitch.push({ t: n.t - Math.min(SLIDE_BEFORE, prev.d * 0.25), v: p(i - 1) });
      pitch.push({ t: n.t + Math.min(SLIDE_AFTER, n.d * 0.25), v: p(i) });
    } else {
      // after a rest the new pitch is ready before the consonants (an m or l is voiced)
      const ready = Math.min(onsetOf.get(i) ?? n.t, n.t) - 0.02;
      pitch.push({ t: Math.max(ready, prev.t + prev.d), v: p(i - 1) });
      pitch.push({ t: Math.max(ready, prev.t + prev.d) + 0.001, v: p(i) });
    }
  }
  pitch.push({ t: length, v: p(notes.length - 1) });
  for (let i = 1; i < pitch.length; i++) if (pitch[i].t < pitch[i - 1].t) pitch[i].t = pitch[i - 1].t;

  // vibrato: none at the start of a note, growing in on the long ones
  const vibrato: Point[] = [{ t: 0, v: 0 }];
  if (o.vibrato > 0) {
    for (const n of notes) {
      if (n.d < VIBRATO_MIN) continue;
      const depth = o.vibrato * Math.min(1, (n.d - VIBRATO_MIN * 0.5) / (VIBRATO_WAIT + VIBRATO_GROW));
      const grown = Math.min(n.t + VIBRATO_WAIT + VIBRATO_GROW, n.t + n.d * 0.8);
      vibrato.push({ t: n.t, v: 0 }, { t: n.t + Math.min(VIBRATO_WAIT, n.d * 0.4), v: 0 }, { t: grown, v: depth }, { t: n.t + n.d - 0.02, v: depth }, { t: n.t + n.d, v: 0 });
    }
  }
  for (let i = 1; i < vibrato.length; i++) if (vibrato[i].t < vibrato[i - 1].t) vibrato[i].t = vibrato[i - 1].t;

  const words: Word[] = [];
  for (const [w, [a, b]] of [...wordSpan.entries()].sort((x, y) => x[1][0] - y[1][0])) words.push({ text: o.words[w] ?? "", t: a, d: b - a });

  return { phones, pitch, vibrato, words, length };
}
