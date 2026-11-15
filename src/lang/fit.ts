/**
 * Words onto a tune when they were written apart from it: which syllable each note sings.
 *
 * A tune falls into phrases (a rest, or a note held clearly longer than the notes around it,
 * ends one), and lyrics fall into lines. A singer fits a line to a phrase, and within it bends
 * the words to the notes: an extra note carries on the syllable before (a melisma), an extra
 * syllable gets half of a long note (a pickup), and only when the notes are too short to halve
 * do two syllables share one. So one miscounted line stays a local problem, and the lines after
 * it still start on their own phrases.
 *
 * All of that is one search: the cheapest way through syllables × notes, where each step puts
 * one syllable on one note, holds one more note, halves a note for two syllables, puts two
 * syllables on one note, leaves a syllable out, or (once the words are used up) sings "la".
 * What each step costs says what a singer prefers; the costs below are the whole policy.
 * A line that starts away from a phrase start pays, a phrase that starts inside a word pays, so
 * lines find their phrases (a line may run over two short phrases, two lines may share a long
 * one: that only costs where they meet). After the search a line given exactly as many notes as
 * it has syllables is sung one to a note, whatever the search did inside it. Words written as
 * one long line still find the phrases: a phrase prefers to start on a word's first syllable
 * and end on its last.
 *
 * The writer's marks always win: "-" pieces are never merged back onto one note, "_" is a held
 * note and "~" one note, exactly as lyrics.ts reads them; the search only adds its own holds and
 * splits around them.
 */
import type { NoteIn } from "./index.ts";
import type { Language } from "./language.ts";
import { lyricUnits, mergeSyllables } from "./lyrics.ts";
import { cleanNotes, la, type Unit } from "./singing.ts";

/** What a note ended up doing. */
export type NoteFitKind = "sung" | "held" | "split" | "merged" | "la";

export interface NoteFit {
  t: number;
  d: number;
  midi: number;
  /**
   *   sung    one syllable starts on it
   *   held    it carries on the syllable before (a "_", or a hold the fit chose)
   *   split   halved, a syllable on each half (a pickup)
   *   merged  two syllables sung on it together
   *   la      the words ran out: sung on "la"
   */
  kind: NoteFitKind;
  /**
   * What starts on it, as the writer wrote it: one syllable; two for a split note (one on each
   * half); for a merged note one, joined by "~"; none when held; "la" when the words ran out.
   */
  text: string[];
  /** index into LyricFit.lines, or -1 for "la" */
  line: number;
  /** the writer asked for this hold with "_" */
  marked: boolean;
  /** a word starts on it (with its first syllable) */
  wordStart: boolean;
}

export type LineHow = "exact" | "held" | "split" | "merged" | "left over";

export interface LineFit {
  /** the line's number in the text as typed, from 1 (blank lines count, as an editor shows them) */
  number: number;
  text: string;
  /** how many notes the line asks for: one for each syllable and each "_" */
  syllables: number;
  /** first and last note it is sung on (indexes into LyricFit.notes), -1 when none */
  first: number;
  last: number;
  /** how many notes it took */
  notes: number;
  /** holds the fit added (the writer's own "_" are not counted) */
  held: number;
  split: number;
  /** notes that took two syllables */
  merged: number;
  /** syllables not sung at all */
  leftOver: number;
  /** what had to be done: ["exact"] when nothing */
  how: LineHow[];
}

export interface LyricFit {
  /** the tune's notes in time order (overlaps trimmed, as sing() takes them) */
  notes: NoteFit[];
  lines: LineFit[];
  /** the note each phrase of the tune starts on */
  phrases: number[];
  /** notes sung on "la" because the words ran out */
  la: number;
  /** syllables never sung */
  leftOver: number;
}

/** What sing() needs: the notes as they will be sung (split notes halved) and a unit for each. */
export interface LyricPlan {
  notes: NoteIn[];
  units: Unit[];
  words: string[];
  fit: LyricFit;
}

// ── what a singer prefers, as costs ──
//
// Set by hand against tests/lang/fit.test.ts. The balance that matters: mending a miscounted
// line (an added hold and a split, about 2) must cost more than what weak phrase evidence offers
// for moving a line start (2.5 × a quarter), and less than what clear evidence asks for keeping
// it (2.5 × a half or more, at two line starts). Then every built-in song fits one to a note
// and a miscount stays in its own line wherever the tune shows its phrases.

/** a line starting where no phrase starts (times how weak the phrase start is not) */
const LINE_OFF = 2.5;
/** a line running on over a phrase start (only when the words are written in lines) */
const LINE_ACROSS = 0.2;
/**
 * a phrase starting inside a word, or ending inside one; when the words are written in lines the
 * lines say where phrases go, and this only settles where a line runs over a phrase start
 */
const WORD_OFF = 0.6;
const WORD_OFF_LINED = 0.2;
/** an added hold; each of a step to the note, a stressed syllable, the line's last syllable makes it EASE cheaper */
const HOLD = 1.5;
const HOLD_EASE = 0.3;
/** an added hold over a rest (the singer would have to sing through it) */
const HOLD_REST = 2;
/** an added hold on a syllable the writer held already */
const HOLD_WRITTEN = 1;
/** an added hold carried over into the next phrase */
const HOLD_ACROSS = 1.5;
/** halving a note: the shorter the note, the dearer, up to SPLIT_MAX */
const SPLIT = 1;
const SPLIT_SHORT = 0.6;
const SPLIT_MAX = 2.5;
/** two syllables on one note: dearer than any split, so it comes only where nothing can be halved */
const MERGE = 3;
/** a syllable left out; a little more the further it is from its line's end, so the last go first */
const DROP = 4;
const DROP_EARLY = 0.01;
/** "la" once the words are used up: starting it, and each note of it */
const LA_START = 0.3;
const LA_NOTE = 0.05;

/** the shortest half a split may leave: shorter is not a note a singer can place a syllable on */
const MIN_HALF = 0.12;
/** a gap shorter than this is sung through (as singing.ts) */
const REST_GAP = 0.12;
/** past this many syllables × notes the search is too big for a keystroke: one to a note, in order */
const MAX_CELLS = 1_500_000;

/** one unit of the lyrics and where it stands among the words */
interface Item {
  unit: Unit;
  line: number;
  lineStart: boolean;
  wordStart: boolean;
  wordEnd: boolean;
  /** the writer split it from the unit before with "-": never put back on one note with it */
  dashBefore: boolean;
  /** the last syllable of its line */
  lastOfLine: boolean;
  text: string;
}

const quantile = (xs: number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const median = (xs: number[]): number => quantile(xs, 0.5);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** how much a stretch of tune played twice in a row says that a phrase starts at each copy */
const REPEAT = 0.5;

/**
 * How strongly a phrase starts at each note, 0..1, with one more entry for the end. Three
 * things say so, and they add up: a rest longer than the tune's usual gap between notes; a
 * note held well over the usual note (twice as long says a little, four times says it fully);
 * and a stretch of at least four notes played again straight after itself (the two halves of
 * "Frère Jacques" have neither rests nor long notes, but each bar comes twice).
 */
export function phraseStarts(notes: readonly NoteIn[]): number[] {
  const k = notes.length;
  const b = new Array<number>(k + 1).fill(0);
  b[0] = 1;
  b[k] = 1;
  if (k < 2) return b;
  const iois: number[] = [];
  const gaps: number[] = [];
  for (let i = 0; i + 1 < k; i++) {
    iois.push(notes[i + 1].t - notes[i].t);
    gaps.push(Math.max(0, notes[i + 1].t - (notes[i].t + notes[i].d)));
  }
  const beat = median(iois) || median(notes.map((n) => n.d)) || 0.5;
  // "long" is measured against the longer of the usual notes: in a tune full of half notes a
  // half note ends nothing
  const usualLong = quantile(iois, 0.8) || beat;
  const usualGap = median(gaps);
  const repeat = repeats(notes, iois);
  for (let i = 1; i < k; i++) {
    const gap = gaps[i - 1];
    const rest = gap >= REST_GAP ? clamp01((gap - usualGap) / (0.6 * beat)) : 0;
    // twice the usual long note says half; twice the usual note says only a quarter
    const long = 1 - (1 - clamp01((iois[i - 1] / usualLong - LONG_FROM) / LONG_OVER)) * (1 - clamp01((iois[i - 1] / beat - LONG_FROM) / (2 * LONG_OVER)));
    b[i] = 1 - (1 - rest) * (1 - long) * (1 - (repeat[i] ? REPEAT : 0));
  }
  return b;
}

/** a note this many times the usual long one starts to say "phrase end" (twice says half), and says it fully LONG_OVER later */
const LONG_FROM = 1.4;
const LONG_OVER = 1.2;

/** Where a stretch of notes is played again at once: the starts of both copies, and the end of the second. */
function repeats(notes: readonly NoteIn[], iois: number[]): boolean[] {
  const k = notes.length;
  const marks = new Array<boolean>(k + 1).fill(false);
  const same = (a: number, c: number, len: number): boolean => {
    for (let j = 0; j < len; j++) {
      if (Math.round(notes[a + j].midi) !== Math.round(notes[c + j].midi)) return false;
      // same rhythm too, up to the next note after each copy (the tune's last note has none)
      const x = iois[a + j];
      const y = iois[c + j] ?? x;
      if (Math.abs(x - y) > 0.1 * x) return false;
    }
    return true;
  };
  for (let len = 4; len <= 16; len++) {
    for (let a = 0; a + 2 * len <= k; a++) {
      const pitches = new Set(notes.slice(a, a + len).map((n) => Math.round(n.midi)));
      if (pitches.size < 2 || !same(a, a + len, len)) continue;
      marks[a] = marks[a + len] = marks[a + 2 * len] = true;
    }
  }
  return marks;
}

/** The written word cut into `n` pieces at its vowel groups, for showing syllables the dictionary found. */
function spell(word: string, n: number): string[] {
  let groups = [...word.matchAll(/[aeiouyàáâäèéêëìíîïòóôöùúûüæœ]+/gi)];
  // a silent final e (a-bove) is not a syllable of its own
  if (groups.length === n + 1 && /[^aeiouy]e$/i.test(word)) groups = groups.slice(0, -1);
  if (n <= 1 || groups.length !== n) return [word, ...new Array<string>(Math.max(0, n - 1)).fill("-")];
  const cuts: number[] = [];
  for (let g = 0; g + 1 < groups.length; g++) {
    const end = groups[g].index! + groups[g][0].length;
    const next = groups[g + 1].index!;
    const cluster = word.slice(end, next).toLowerCase();
    // one consonant goes with the next syllable; of two or more, the first stays (won-der),
    // except pairs that are one sound
    if (cluster.length <= 1) cuts.push(end);
    else if (/^(th|sh|ch|ph|wh)$/.test(cluster)) cuts.push(end);
    else if (/^(ck|ng)/.test(cluster)) cuts.push(end + 2);
    else cuts.push(end + 1);
  }
  const out: string[] = [];
  let at = 0;
  for (const c of cuts) {
    out.push(word.slice(at, c));
    at = c;
  }
  out.push(word.slice(at));
  return out;
}

const bare = (text: string): string => text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "") || text;

/** The lyrics, line by line, as items; and the words for captions. */
function readLines(lyrics: string, lang: Language) {
  const items: Item[] = [];
  const words: string[] = [];
  const lines: { number: number; text: string; from: number; to: number }[] = [];
  lyrics.split("\n").forEach((raw, row) => {
    const text = raw.trim();
    if (!text) return;
    const lyr = lyricUnits(text, lang);
    if (!lyr.units.length) return;
    const line = lines.length;
    const from = items.length;
    const shift = words.length;
    words.push(...lyr.words);
    const units = lyr.units.map((u): Unit => (u.kind === "syl" && u.word >= 0 ? { ...u, word: u.word + shift } : u));
    const wordOf = (u: Unit | undefined): number => (u?.kind === "syl" ? u.word : -2);
    units.forEach((unit, i) => {
      const before = units.slice(0, i).reverse().find((x) => x.kind === "syl");
      const after = units.slice(i + 1).find((x) => x.kind === "syl");
      const prev = units[i - 1];
      const next = units[i + 1];
      // a hold belongs to the word of the syllable it carries on
      const own = unit.kind === "syl" ? unit.word : wordOf(before);
      items.push({
        unit,
        line,
        lineStart: i === 0,
        wordStart: unit.kind === "syl" && wordOf(before) !== unit.word,
        // a word ends where no hold follows and the next syllable is another word's
        wordEnd: next?.kind !== "hold" && (!after || wordOf(after) !== own),
        dashBefore: unit.kind === "syl" && prev?.kind === "syl" && prev.word === unit.word && prev.text !== unit.text,
        lastOfLine: unit.kind === "syl" && !after,
        text: unit.kind === "syl" ? bare(unit.text) : "",
      });
    });
    // syllables the dictionary found in one written word show as pieces of its spelling
    for (let i = from; i < items.length; ) {
      const u = items[i].unit;
      let j = i + 1;
      if (u.kind === "syl") while (j < items.length && items[j].unit.kind === "syl" && sameWritten(items[j].unit, u)) j++;
      if (j - i > 1) spell(items[i].text, j - i).forEach((piece, k) => (items[i + k].text = piece));
      i = j;
    }
    lines.push({ number: row + 1, text, from, to: items.length });
  });
  return { items, words, lines };
}

const sameWritten = (a: Unit, b: Unit): boolean => a.kind === "syl" && b.kind === "syl" && a.word === b.word && a.text === b.text;

/** What one note does in the chosen path. */
interface Step {
  kind: NoteFitKind;
  /** the items that start on it */
  items: number[];
}

const MATCH = 1;
const HOLD_STEP = 2;
const SPLIT_STEP = 3;
const MERGE_STEP = 4;
const DROP_STEP = 5;
const LA_STEP = 6;

/** The search (see the header). Returns a step for each note, and which items were left out. */
function search(notes: NoteIn[], items: Item[], b: number[], lined: boolean): { steps: Step[]; dropped: number[] } {
  const k = notes.length;
  const m = items.length;
  const beat = median(notes.map((n) => n.d)) || 0.5;
  const across = lined ? LINE_ACROSS : 0;
  const wordOff = lined ? WORD_OFF_LINED : WORD_OFF;
  // the syllable a hold before item u would carry on: the last syllable before it
  const lastSyl = new Int32Array(m + 1).fill(-1);
  for (let u = 1; u <= m; u++) lastSyl[u] = items[u - 1].unit.kind === "syl" ? u - 1 : lastSyl[u - 1];

  const toLineEnd = new Int32Array(m);
  for (let u = m - 1; u >= 0; u--) toLineEnd[u] = u + 1 < m && !items[u + 1].lineStart ? toLineEnd[u + 1] + 1 : 0;

  /** items a..z starting on note n */
  const place = (a: number, z: number, n: number): number => {
    let c = items[a].lineStart ? LINE_OFF * (1 - b[n]) : across * b[n];
    if (!items[a].wordStart) c += wordOff * b[n];
    if (!items[z].wordEnd) c += wordOff * b[n + 1];
    return c;
  };
  const holdCost = (u: number, n: number): number => {
    const s = items[lastSyl[u]];
    const syl = s.unit.kind === "syl" ? s.unit.syl : null;
    let c = HOLD;
    if (Math.abs(notes[n].midi - notes[n - 1].midi) <= 2) c -= HOLD_EASE;
    if (syl?.stress === 1) c -= HOLD_EASE;
    if (s.lastOfLine) c -= HOLD_EASE;
    if (notes[n].t - (notes[n - 1].t + notes[n - 1].d) >= REST_GAP) c += HOLD_REST;
    // a syllable the writer already held with "_" is as long as the writer wants it
    if (items[u - 1].unit.kind === "hold" || items[u]?.unit.kind === "hold") c += HOLD_WRITTEN;
    c += (HOLD_ACROSS + wordOff) * b[n];
    // and the phrase ending on it should end a word
    const wordGoesOn = u < m && !items[u].wordStart && !items[u].lineStart;
    if (wordGoesOn) c += wordOff * b[n + 1];
    return c;
  };
  const splitCost = (u: number, n: number): number => {
    const second = items[u + 1].unit;
    // an unstressed syllable on the second half is the natural pickup
    const light = second.kind === "syl" && second.syl.stress === 0 ? 0.1 : 0;
    return Math.min(SPLIT_MAX, SPLIT + (SPLIT_SHORT * beat) / notes[n].d) - light;
  };
  const pairable = (u: number): boolean =>
    u + 1 < m && items[u].unit.kind === "syl" && items[u + 1].unit.kind === "syl" && !items[u + 1].lineStart;

  // cost[(u * (k + 1) + n) * 2 + f]: the cheapest way to have used items < u on notes < n,
  // f = 1 when note n - 1 was sung on "la"
  const size = (m + 1) * (k + 1) * 2;
  const cost = new Float64Array(size).fill(Infinity);
  const how = new Uint8Array(size);
  const at = (u: number, n: number, f: number) => (u * (k + 1) + n) * 2 + f;
  cost[at(0, 0, 0)] = 0;
  const relax = (u: number, n: number, f: number, c: number, step: number, fFrom: number) => {
    const i = at(u, n, f);
    if (c < cost[i] - 1e-12) {
      cost[i] = c;
      how[i] = step * 2 + fFrom;
    }
  };
  for (let u = 0; u <= m; u++) {
    for (let n = 0; n <= k; n++) {
      for (let f = 0; f < 2; f++) {
        const c = cost[at(u, n, f)];
        if (c === Infinity) continue;
        if (u < m) relax(u + 1, n, f, c + DROP + DROP_EARLY * toLineEnd[u], DROP_STEP, f);
        if (n === k) continue;
        if (u < m) relax(u + 1, n + 1, 0, c + place(u, u, n), MATCH, f);
        if (n > 0 && f === 0 && lastSyl[u] >= 0) relax(u, n + 1, 0, c + holdCost(u, n), HOLD_STEP, f);
        if (pairable(u)) {
          const both = place(u, u + 1, n);
          if (notes[n].d / 2 >= MIN_HALF) relax(u + 2, n + 1, 0, c + both + splitCost(u, n), SPLIT_STEP, f);
          if (!items[u + 1].dashBefore) relax(u + 2, n + 1, 0, c + both + MERGE, MERGE_STEP, f);
        }
        if (u === m) relax(u, n + 1, 1, c + LA_NOTE + (f ? 0 : LA_START + LINE_OFF * (1 - b[n])), LA_STEP, f);
      }
    }
  }

  // walk back from the cheapest end
  let u = m;
  let n = k;
  let f = cost[at(m, k, 0)] <= cost[at(m, k, 1)] ? 0 : 1;
  const steps: Step[] = new Array(k);
  const dropped: number[] = [];
  while (u > 0 || n > 0) {
    const code = how[at(u, n, f)];
    const step = code >> 1;
    const fFrom = code & 1;
    if (step === DROP_STEP) {
      dropped.push(--u);
    } else if (step === MATCH) {
      steps[--n] = { kind: items[--u].unit.kind === "hold" ? "held" : "sung", items: [u] };
    } else if (step === HOLD_STEP) {
      steps[--n] = { kind: "held", items: [] };
    } else if (step === SPLIT_STEP || step === MERGE_STEP) {
      u -= 2;
      steps[--n] = { kind: step === SPLIT_STEP ? "split" : "merged", items: [u, u + 1] };
    } else if (step === LA_STEP) {
      steps[--n] = { kind: "la", items: [] };
    } else break;
    f = fFrom;
  }
  return { steps, dropped: dropped.reverse() };
}

/** Too big to search: one unit to a note, in order, as sing() always did. */
function inOrder(k: number, m: number): { steps: Step[]; dropped: number[] } {
  const steps: Step[] = [];
  for (let n = 0; n < k; n++) steps.push(n < m ? { kind: "sung", items: [n] } : { kind: "la", items: [] });
  return { steps, dropped: Array.from({ length: Math.max(0, m - k) }, (_, i) => k + i) };
}

/** Plan the words onto the tune: the search, then exact lines made one to a note, then sing()'s input and the report. */
export function planLyrics(rawNotes: readonly NoteIn[], lyrics: string, lang: Language): LyricPlan {
  const notes = cleanNotes(rawNotes);
  const { items, words, lines } = readLines(lyrics, lang);
  const b = phraseStarts(notes);
  const k = notes.length;
  const m = items.length;
  const found = (m + 1) * (k + 1) > MAX_CELLS ? inOrder(k, m) : search(notes, items, b, lines.length > 1);
  const steps = found.steps;
  const dropped = new Set(found.dropped);

  // which line each note serves: its first item's, or for a hold the held syllable's
  const lineOf = (): number[] => {
    let last = -1;
    return steps.map((s) => {
      if (s.kind === "la") return -1;
      if (s.items.length) last = items[s.items[0]].line;
      return last;
    });
  };
  // a line given exactly as many notes as it asks for is sung one to a note (words in one long
  // line keep what the search found: there the phrases are all that says where they go)
  let noteLine = lineOf();
  if (lines.length > 1) lines.forEach((line, l) => {
    const taken: number[] = [];
    noteLine.forEach((x, n) => x === l && taken.push(n));
    if (!taken.length || taken.length !== line.to - line.from || taken[taken.length - 1] - taken[0] !== taken.length - 1) return;
    const exact = taken.every((n, i) => steps[n].items.length === 1 && steps[n].items[0] === line.from + i);
    if (exact) return;
    taken.forEach((n, i) => {
      const item = line.from + i;
      steps[n] = { kind: items[item].unit.kind === "hold" ? "held" : "sung", items: [item] };
      dropped.delete(item);
    });
  });
  noteLine = lineOf();

  // what sing() sings
  const sungNotes: NoteIn[] = [];
  const units: Unit[] = [];
  steps.forEach((s, n) => {
    const note = notes[n];
    if (s.kind === "split") {
      const half = note.d / 2;
      sungNotes.push({ ...note, d: half }, { ...note, t: note.t + half, d: half });
      units.push(items[s.items[0]].unit, items[s.items[1]].unit);
      return;
    }
    sungNotes.push(note);
    if (s.kind === "la") units.push({ kind: "syl", syl: la(), word: -1, text: "la" });
    else if (s.kind === "held" && !s.items.length) units.push({ kind: "hold" });
    else if (s.kind === "merged") {
      const [a, z] = s.items.map((i) => items[i].unit) as [Extract<Unit, { kind: "syl" }>, Extract<Unit, { kind: "syl" }>];
      units.push({ kind: "syl", syl: mergeSyllables([a.syl, z.syl]), word: a.word, text: a.text + "~" + z.text, ...(z.word !== a.word ? { also: z.word } : {}) });
    } else units.push(items[s.items[0]].unit);
  });

  // the report
  const noteFits: NoteFit[] = steps.map((s, n) => ({
    t: notes[n].t,
    d: notes[n].d,
    midi: notes[n].midi,
    kind: s.kind,
    text: s.kind === "la" ? ["la"] : s.kind === "merged" ? [s.items.map((i) => items[i].text).join("~")] : s.items.map((i) => items[i].text).filter((t) => t),
    line: noteLine[n],
    marked: s.kind === "held" && s.items.length === 1,
    wordStart: s.items.length > 0 && items[s.items[0]].wordStart,
  }));
  const lineFits: LineFit[] = lines.map((line, l) => {
    const taken = noteFits.map((x, n) => (x.line === l ? n : -1)).filter((n) => n >= 0);
    const count = (kind: NoteFitKind, marked = false) => taken.filter((n) => noteFits[n].kind === kind && noteFits[n].marked === marked).length;
    let leftOver = 0;
    for (let i = line.from; i < line.to; i++) if (dropped.has(i)) leftOver++;
    const fit: LineFit = {
      number: line.number,
      text: line.text,
      syllables: line.to - line.from,
      first: taken.length ? taken[0] : -1,
      last: taken.length ? taken[taken.length - 1] : -1,
      notes: taken.length,
      held: count("held"),
      split: count("split"),
      merged: count("merged"),
      leftOver,
      how: [],
    };
    if (fit.held) fit.how.push("held");
    if (fit.split) fit.how.push("split");
    if (fit.merged) fit.how.push("merged");
    if (fit.leftOver) fit.how.push("left over");
    if (!fit.how.length) fit.how.push("exact");
    return fit;
  });
  const phrases: number[] = [];
  for (let n = 0; n < k; n++) if (b[n] >= 0.45) phrases.push(n);

  return {
    notes: sungNotes,
    units,
    words,
    fit: { notes: noteFits, lines: lineFits, phrases, la: steps.filter((s) => s.kind === "la").length, leftOver: dropped.size },
  };
}

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const count = (n: number): string => NUMBERS[n] ?? String(n);
const capital = (s: string): string => s[0].toUpperCase() + s.slice(1);
const listOf = (xs: number[]): string => (xs.length === 1 ? String(xs[0]) : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One short sentence for the page: how the words fit, and what to do about it. "" with no words. */
export function describeFit(fit: LyricFit): string {
  if (!fit.lines.length) return "";
  const trouble = fit.lines.filter((l) => l.how[0] !== "exact");
  const ranOut = fit.la ? `The words run out before the tune: the last ${count(fit.la)} ${fit.la === 1 ? "note is" : "notes are"} sung on “la”.` : "";
  if (!trouble.length) return ranOut || (fit.lines.length > 1 ? "Every line fits its phrase." : "Every syllable has its note.");
  const l = trouble[0];
  const who = fit.lines.length > 1 ? `Line ${l.number} has` : "The words have";
  const has = `${who} ${count(l.syllables)} ${l.syllables === 1 ? "syllable" : "syllables"} for ${count(l.notes)} ${l.notes === 1 ? "note" : "notes"}`;
  let say: string;
  if (l.leftOver) say = `${has}, so ${count(l.leftOver)} ${l.leftOver === 1 ? "is" : "are"} not sung. Take out a word, or join syllables with ~ to share a note.`;
  else if (l.merged) say = `${has}, too short to halve, so ${count(l.merged)} ${l.merged === 1 ? "note carries" : "notes carry"} two syllables. Join syllables with ~ to choose which.`;
  else if (l.split) say = `${has}, so ${count(l.split)} ${l.split === 1 ? "note was" : "notes were"} split. Join syllables with ~ to keep them on one note.`;
  else {
    const held = fit.notes.findIndex((n, i) => i >= l.first && i <= l.last && n.kind === "held" && !n.marked);
    let from = held - 1;
    while (from > 0 && !fit.notes[from].text.length) from--;
    const syllable = fit.notes[from]?.text.at(-1);
    say =
      l.held === 1 && syllable
        ? `${has}, so “${syllable}” is held over two notes. Write _ where you want a syllable held.`
        : `${has}, so ${count(l.held)} ${l.held === 1 ? "note holds" : "notes hold"} the syllable before. Write _ where you want a syllable held.`;
  }
  const more = trouble.slice(1).map((x) => x.number);
  if (more.length) say += ` ${capital(more.length === 1 ? "also line" : "also lines")} ${listOf(more.slice(0, 4))}${more.length > 4 ? " and more" : ""}.`;
  return ranOut ? `${say} ${ranOut}` : say;
}
