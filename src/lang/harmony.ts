/**
 * What a bare tune implies: its key, its beat and bar, where its phrases end, and a chord for
 * each half bar (or bar) that fits the notes sounding there.
 *
 *   key      Krumhansl–Schmuckler: the tune's pitch classes, weighted by how long they sound,
 *            correlated with the Krumhansl–Kessler key profiles (Krumhansl & Kessler 1982;
 *            Krumhansl, "Cognitive Foundations of Musical Pitch", 1990, ch. 4).
 *   beat     the period whose grid the note onsets fall on best, with a preference for beats
 *            near 100 a minute, where listeners most readily tap (van Noorden & Moelants 1999).
 *   bar      long notes and phrase starts fall on downbeats (Lerdahl & Jackendoff 1983, the
 *            metrical preference rules): the meter and downbeat that gather the most length.
 *   chords   a best path (Viterbi) through the common chords of the key, scored by how well
 *            each fits the melody (strong beats and long notes count most), by how usual it is,
 *            by how usual the step from the chord before is, and by cadences at phrase ends.
 */
import type { NoteIn } from "./index.ts";
import { phraseStarts } from "./fit.ts";

export interface Key {
  /** pitch class of the tonic, 0 = C */
  tonic: number;
  mode: "major" | "minor";
}

export interface Chord {
  t: number;
  d: number;
  /** pitch class of the root */
  root: number;
  /** pitch classes, root first, then third, fifth (and seventh) */
  tones: number[];
  name: string;
  /** its place in the key: "I", "V7", "vi", "V/V" */
  roman: string;
  /** the last chord of a phrase */
  cadence: boolean;
}

export interface Meter {
  /** seconds a beat */
  beat: number;
  /** beats a bar */
  meter: number;
  /** a bar line: the time of the first downbeat at or after the first note */
  downbeat: number;
  /** how the beat divides: 2 (simple) or 3 (compound, like 6/8) */
  division: 2 | 3;
}

/** A phrase of the tune: its notes [first, last] (indices into the cleaned notes) and its span in seconds. */
export interface Phrase {
  first: number;
  last: number;
  t: number;
  end: number;
  /** when its last note starts (where its cadence falls) */
  close: number;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const pc = (midi: number): number => ((Math.round(midi) % 12) + 12) % 12;

/** Notes in time order, without overlaps or empty notes, midi rounded. */
export function tidyNotes(notes: readonly NoteIn[]): NoteIn[] {
  const sorted = notes
    .filter((n) => n.d > 0 && Number.isFinite(n.t) && Number.isFinite(n.d) && Number.isFinite(n.midi))
    .map((n) => ({ t: n.t, d: n.d, midi: Math.round(n.midi) }))
    .sort((a, b) => a.t - b.t || b.midi - a.midi);
  const out: NoteIn[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && n.t < prev.t + 0.01) continue;
    if (prev && prev.t + prev.d > n.t) prev.d = n.t - prev.t;
    out.push(n);
  }
  return out;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/**
 * The key, by Krumhansl–Schmuckler. A tune usually ends on its tonic, and its last note is held:
 * that note counts as if it were held twice as long again (a nudge only; the correlation decides).
 */
export function findKey(notes: readonly NoteIn[]): Key & { strength: number } {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pc(n.midi)] += Math.min(n.d, 4);
  const last = notes[notes.length - 1];
  if (last) hist[pc(last.midi)] += 2 * Math.min(last.d, 4) + 0.3;
  let best = { tonic: 0, mode: "major" as Key["mode"], strength: -2 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = hist.map((_, i) => profile[(i - tonic + 12) % 12]);
      const r = correlation(hist, rotated);
      if (r > best.strength + 1e-9) best = { tonic, mode, strength: r };
    }
  }
  return best;
}

const gauss = (x: number): number => Math.exp(-0.5 * x * x);

/** How close x (in beats) is to a whole beat: fully on one, partly on a half or a third of one. */
function onGrid(x: number, tight: number): number {
  const off = x - Math.round(x);
  const half = x * 2 - Math.round(x * 2);
  const third = x * 3 - Math.round(x * 3);
  return Math.max(gauss(off / tight), 0.4 * gauss(half / (2 * tight)), 0.3 * gauss(third / (2.5 * tight)));
}

/**
 * How well the time between onsets (to each of the next three) comes in whole beats of p. Only
 * differences count, so a tune that drifts in tempo is still heard by its local beat.
 */
function spanFit(onsets: readonly number[], p: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < onsets.length; i++) {
    for (let k = 1; k <= 3 && i + k < onsets.length; k++) {
      const span = onsets[i + k] - onsets[i];
      if (span > 4) break;
      sum += onGrid(span / p, 0.06);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** How well onsets fall on a grid of period p starting at phase. */
function gridFit(onsets: readonly number[], p: number, phase: number): number {
  let sum = 0;
  for (const t of onsets) sum += onGrid((t - phase) / p, 0.08);
  return sum / onsets.length;
}

/** The beat, the bar, and where bars start. */
export function findMeter(notes: readonly NoteIn[]): Meter {
  const onsets = notes.map((n) => n.t);
  if (onsets.length < 3) return { beat: 0.6, meter: 4, downbeat: onsets[0] ?? 0, division: 2 };

  // 1. the beat period, from the spans between onsets, then finer around the best
  // tempo preference: a log-normal around 0.6 s, 0.7 of an octave wide
  const prior = (p: number) => gauss(Math.log2(p / 0.6) / 0.7);
  let p = 0.6;
  let top = -1;
  for (let q = 0.25; q <= 1.6; q *= 1.004) {
    const score = spanFit(onsets, q) * prior(q);
    if (score > top) {
      top = score;
      p = q;
    }
  }
  for (let q = p * 0.996; q <= p * 1.004; q *= 1.0002) {
    const score = spanFit(onsets, q) * prior(q);
    if (score > top) {
      top = score;
      p = q;
    }
  }
  // its phase
  let phase = onsets[0];
  top = -1;
  for (let k = 0; k < 48; k++) {
    const at = onsets[0] + (k / 48) * p;
    const score = gridFit(onsets, p, at);
    if (score > top) {
      top = score;
      phase = at;
    }
  }
  // refine both by least squares over the onsets that sit on beats
  for (let pass = 0; pass < 3; pass++) {
    const pts: [number, number][] = [];
    for (const t of onsets) {
      const k = Math.round((t - phase) / p);
      if (Math.abs(t - phase - k * p) < 0.12 * p) pts.push([k, t]);
    }
    if (pts.length < 3) break;
    const n = pts.length;
    const mk = pts.reduce((s, q) => s + q[0], 0) / n;
    const mt = pts.reduce((s, q) => s + q[1], 0) / n;
    let num = 0;
    let den = 0;
    for (const [k, t] of pts) {
      num += (k - mk) * (t - mt);
      den += (k - mk) ** 2;
    }
    if (den <= 0) break;
    p = num / den;
    phase = mt - p * mk;
  }

  // 2. how the beat divides: onsets on thirds of a beat but not halves say compound time
  let halves = 0;
  let thirds = 0;
  for (const t of onsets) {
    const x = (t - phase) / p;
    const off = Math.abs(x - Math.round(x));
    if (off < 0.06) continue;
    if (Math.abs(x * 2 - Math.round(x * 2)) < 0.12) halves++;
    else if (Math.abs(x * 3 - Math.round(x * 3)) < 0.15) thirds++;
  }
  const division: 2 | 3 = thirds > 2 && thirds > 2 * halves ? 3 : 2;

  // 3. the bar: which meter and offset put the most accent on downbeats
  const accents: { k: number; a: number }[] = [];
  const starts = phraseStarts(notes);
  notes.forEach((n, i) => {
    const x = (n.t - phase) / p;
    const k = Math.round(x);
    if (Math.abs(x - k) > 0.12) return;
    const next = notes[i + 1];
    const span = next ? next.t - n.t : n.d;
    // A long note is a strong one, except the long note that ends a phrase: that one may fall
    // anywhere in the bar ("lit-tle star" ends on beat three).
    const ends = starts[i + 1] >= 0.45;
    let a = ends ? Math.min(span / p, 1) : Math.min(span / p, 4);
    if (!next) a += 0.5;
    // a tune starts on a downbeat or just before one (a pickup); a phrase start is strong too
    if (starts[i] >= 0.45 && i > 0) a += 1;
    if (i === 0) a += 1.5;
    accents.push({ k, a });
  });
  const total = accents.reduce((s, x) => s + x.a, 0) || 1;
  const lift = (m: number): { lift: number; offset: number } => {
    let top = { lift: 0, offset: 0 };
    for (let o = 0; o < m; o++) {
      let s = 0;
      for (const x of accents) if ((((x.k - o) % m) + m) % m === 0) s += x.a;
      if ((s / total) * m > top.lift) top = { lift: (s / total) * m, offset: o };
    }
    return top;
  };
  const three = lift(3);
  const four = lift(4);
  const two = lift(2);
  let meter = 4;
  let offset = four.offset;
  if (three.lift > four.lift * 1.05 && three.lift > two.lift * 1.1) {
    meter = 3;
    offset = three.offset;
  } else if (division === 3 && two.lift >= four.lift * 0.9) {
    meter = 2;
    offset = two.offset;
  }
  // the first downbeat at or after the first note
  let downbeat = phase + offset * p;
  const first = onsets[0];
  while (downbeat - meter * p >= first - 0.1 * p) downbeat -= meter * p;
  while (downbeat < first - 0.1 * p) downbeat += meter * p;
  return { beat: p, meter, downbeat, division };
}

/** Where the tune's phrases are, from the same evidence the lyric fit uses (fit.ts). */
export function findPhrases(notes: readonly NoteIn[]): Phrase[] {
  if (!notes.length) return [];
  const b = phraseStarts(notes);
  const out: Phrase[] = [];
  let first = 0;
  for (let i = 1; i <= notes.length; i++) {
    if (i === notes.length || b[i] >= 0.45) {
      out.push({ first, last: i - 1, t: notes[first].t, end: notes[i - 1].t + notes[i - 1].d, close: notes[i - 1].t });
      first = i;
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────── chords ──

interface Candidate {
  /** root, in semitones above the tonic */
  degree: number;
  /** the chord's tones in semitones above its root */
  shape: number[];
  roman: string;
  /** how usual the chord is in plain tunes, as a score */
  prior: number;
}

const MAJOR_CHORDS: Candidate[] = [
  { degree: 0, shape: [0, 4, 7], roman: "I", prior: 0.6 },
  { degree: 7, shape: [0, 4, 7], roman: "V", prior: 0.5 },
  { degree: 5, shape: [0, 4, 7], roman: "IV", prior: 0.45 },
  { degree: 9, shape: [0, 3, 7], roman: "vi", prior: 0.2 },
  { degree: 2, shape: [0, 3, 7], roman: "ii", prior: 0.15 },
  { degree: 7, shape: [0, 4, 7, 10], roman: "V7", prior: 0.25 },
  { degree: 4, shape: [0, 3, 7], roman: "iii", prior: -0.3 },
  { degree: 2, shape: [0, 4, 7], roman: "V/V", prior: -0.5 },
];

const MINOR_CHORDS: Candidate[] = [
  { degree: 0, shape: [0, 3, 7], roman: "i", prior: 0.6 },
  { degree: 7, shape: [0, 4, 7], roman: "V", prior: 0.5 },
  { degree: 5, shape: [0, 3, 7], roman: "iv", prior: 0.45 },
  { degree: 8, shape: [0, 4, 7], roman: "VI", prior: 0.2 },
  { degree: 3, shape: [0, 4, 7], roman: "III", prior: 0.15 },
  { degree: 10, shape: [0, 4, 7], roman: "VII", prior: 0.05 },
  { degree: 7, shape: [0, 4, 7, 10], roman: "V7", prior: 0.25 },
  { degree: 7, shape: [0, 3, 7], roman: "v", prior: -0.2 },
  { degree: 2, shape: [0, 3, 6], roman: "ii°", prior: -0.4 },
];

/** How usual the step from one chord to the next is (by roman numeral), as a score. */
function stepScore(from: string, to: string): number {
  if (from === to) return 0;
  const key = `${from}>${to}`;
  const table: Record<string, number> = {
    "V>I": 0.6, "V7>I": 0.8, "IV>V": 0.4, "IV>V7": 0.4, "ii>V": 0.5, "ii>V7": 0.5, "I>IV": 0.3, "I>V": 0.3,
    "vi>ii": 0.3, "vi>IV": 0.3, "I>vi": 0.2, "IV>I": 0.2, "V>vi": 0.3, "V7>vi": 0.2, "iii>vi": 0.2, "V/V>V": 0.6,
    "V/V>V7": 0.6, "I>ii": 0.1, "V>V7": 0.4, "IV>ii": 0.1,
    "V>IV": -0.5, "V7>IV": -0.8, "V>ii": -0.5, "V7>ii": -0.8, "V7>V": -0.8, "V7>iii": -0.8,
    "V>i": 0.6, "V7>i": 0.8, "iv>V": 0.4, "iv>V7": 0.4, "i>iv": 0.3, "i>V": 0.3, "VI>iv": 0.3, "i>VI": 0.2,
    "iv>i": 0.2, "V>VI": 0.3, "ii°>V": 0.5, "VII>III": 0.4, "III>iv": 0.2, "III>VI": 0.2, "VI>V": 0.2,
    "V>iv": -0.5, "V7>iv": -0.8,
  };
  if (from === "V/V" && to !== "V" && to !== "V7") return -1;
  return table[key] ?? -0.05;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The name of a pitch class as the key would spell it. */
export function pcName(p: number, key: Key): string {
  const flatMajor = [5, 10, 3, 8, 1, 6];
  const relative = key.mode === "major" ? key.tonic : (key.tonic + 3) % 12;
  return (flatMajor.includes(relative) ? FLAT_NAMES : SHARP_NAMES)[((p % 12) + 12) % 12];
}

export function keyName(key: Key): string {
  return `${pcName(key.tonic, key)} ${key.mode}`;
}

function chordName(c: Candidate, key: Key): string {
  const root = pcName(key.tonic + c.degree, key);
  const s = c.shape.join(",");
  if (s === "0,3,7") return root + "m";
  if (s === "0,3,6") return root + "dim";
  if (s === "0,4,7,10") return root + "7";
  return root;
}

/** Metric weight of an onset: the bar's downbeat, the half bar, other beats, between beats. */
function metricWeight(t: number, m: Meter): number {
  const x = (t - m.downbeat) / m.beat;
  const k = Math.round(x);
  if (Math.abs(x - k) > 0.1) return 0.6;
  const inBar = ((k % m.meter) + m.meter) % m.meter;
  if (inBar === 0) return 2;
  if (m.meter === 4 && inBar === 2) return 1.4;
  return 1;
}

/**
 * A chord for each half bar (bars of 4) or bar (bars of 2 or 3, or any bar shorter than 1.2 s),
 * chosen as described in the header. Consecutive spans on the same chord are merged.
 */
export function findChords(notes: readonly NoteIn[], key: Key, m: Meter, phrases: readonly Phrase[]): Chord[] {
  if (!notes.length) return [];
  const bar = m.beat * m.meter;
  const unit = m.meter === 4 && bar >= 1.2 ? 2 * m.beat : bar;
  const end = Math.max(...notes.map((n) => n.t + n.d));
  // the grid of spans, from the first span that holds the first note
  let start = m.downbeat;
  while (start > notes[0].t + 1e-6) start -= unit;
  const spans: { t: number; d: number; barLine: boolean }[] = [];
  for (let t = start; t < end - 0.05 * m.beat; t += unit) {
    const fromBar = (t - m.downbeat) / bar;
    spans.push({ t, d: unit, barLine: Math.abs(fromBar - Math.round(fromBar)) < 0.01 });
  }
  if (!spans.length) spans.push({ t: start, d: end - start, barLine: true });
  const cands = key.mode === "major" ? MAJOR_CHORDS : MINOR_CHORDS;
  const tones = cands.map((c) => c.shape.map((s) => (key.tonic + c.degree + s) % 12));

  // how well each candidate fits the melody in each span
  const fit = spans.map((span) => {
    const a = span.t;
    const b = span.t + span.d;
    return cands.map((_, ci) => {
      let score = 0;
      for (const n of notes) {
        const overlap = Math.min(b, n.t + n.d) - Math.max(a, n.t);
        if (overlap <= 0.01) continue;
        const beats = Math.min(overlap, 2 * m.beat) / m.beat;
        const startsHere = n.t >= a - 1e-6;
        const w = beats * (startsHere ? metricWeight(n.t, m) : 0.8);
        const at = tones[ci].indexOf(pc(n.midi));
        if (at === 0) score += 1.1 * w;
        else if (at === 1 || at === 2) score += w;
        else if (at === 3) score += 0.6 * w;
        else score -= w * (startsHere && Math.abs(n.t - a) < 0.05 * m.beat ? 1.5 : 1);
      }
      return score;
    });
  });

  // phrase ends: the span where each phrase's last note starts
  const cadenceAt = new Set<number>();
  for (const ph of phrases) {
    const t = ph.close;
    const i = spans.findIndex((s) => t >= s.t - 1e-6 && t < s.t + s.d - 1e-6);
    if (i >= 0) cadenceAt.add(i);
  }
  const lastSpan = spans.length - 1;
  const tonicRoman = key.mode === "major" ? "I" : "i";

  const local = (i: number, ci: number): number => {
    const c = cands[ci];
    let s = fit[i][ci] + c.prior;
    if (i === 0 && c.roman === tonicRoman) s += 0.8;
    if (i === lastSpan) s += c.roman === tonicRoman ? 2.5 : -3;
    else if (cadenceAt.has(i)) s += c.roman === tonicRoman ? 1 : c.roman === "V" ? 0.5 : -0.8;
    return s;
  };

  // Viterbi
  const n = spans.length;
  const k = cands.length;
  const score = new Float64Array(n * k).fill(-Infinity);
  const back = new Int32Array(n * k).fill(-1);
  for (let c = 0; c < k; c++) score[c] = local(0, c);
  const fast = unit < 0.8;
  for (let i = 1; i < n; i++) {
    for (let c = 0; c < k; c++) {
      const here = local(i, c);
      for (let p = 0; p < k; p++) {
        let s = score[(i - 1) * k + p] + here;
        if (p !== c) {
          s += stepScore(cands[p].roman, cands[c].roman);
          if (!spans[i].barLine) s -= fast ? 0.5 : 0.25;
        }
        if (s > score[i * k + c]) {
          score[i * k + c] = s;
          back[i * k + c] = p;
        }
      }
    }
  }
  let c = 0;
  for (let x = 1; x < k; x++) if (score[(n - 1) * k + x] > score[(n - 1) * k + c]) c = x;
  const path = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    path[i] = c;
    c = back[i * k + c];
  }

  const out: Chord[] = [];
  path.forEach((ci, i) => {
    const prev = out[out.length - 1];
    const cand = cands[ci];
    if (prev && prev.roman === cand.roman) {
      prev.d += spans[i].d;
      prev.cadence ||= cadenceAt.has(i);
      return;
    }
    out.push({
      t: spans[i].t,
      d: spans[i].d,
      root: (key.tonic + cand.degree) % 12,
      tones: tones[ci],
      name: chordName(cand, key),
      roman: cand.roman,
      cadence: cadenceAt.has(i),
    });
  });
  // the last chord lasts to the end of the last note
  const last = out[out.length - 1];
  last.d = Math.max(last.d, end - last.t);
  return out;
}

/** The chord sounding at time t (the first before the start, the last after the end). */
export function chordAt(chords: readonly Chord[], t: number): Chord {
  for (let i = chords.length - 1; i >= 0; i--) if (chords[i].t <= t + 1e-6) return chords[i];
  return chords[0];
}
