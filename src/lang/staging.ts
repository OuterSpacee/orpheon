/**
 * Staging: the shape of a performance, as an arranger plans it before writing a note. Who sings
 * each phrase, and how full the band is there, so that the song builds:
 *
 *   - the tune alone first, the other voices coming in one at a time (the one that makes the
 *     sweetest duet with the tune first, then the others), the whole choir by about the middle;
 *   - a phrase that repeats the one before it never sounds the same twice: by then another voice
 *     has come in;
 *   - while the choir builds, the voices that join hum under the tune ("ooh", the bass "ah"); the
 *     words are everyone's once the choir is whole;
 *   - in a long song, a lighter phrase after the choir is whole, on a new strain of the tune (a
 *     B section), so the return is felt: the men take the tune (the tenor an octave down, over
 *     the bass), and the women answer in the next phrase (the alto in thirds and sixths under
 *     the tune) unless that is the last; then the whole choir to the end.
 *
 * The form is read from the tune itself: two phrases are the same strain when they move by the
 * same steps in the same rhythm (form()).
 *
 * Every voice keeps the whole song's words; a phrase it rests in is cut out of its sung score
 * (silence()), so a word can never land on the wrong note. The band reads energy(): 0 is the tune
 * alone, 1 the whole choir.
 */
import type { Score } from "../contract.ts";
import type { Phrase } from "./harmony.ts";
import type { NoteIn } from "./index.ts";

/** What one phrase of the plan is. */
export interface StagedPhrase {
  t: number;
  end: number;
  /** Its strain: "A" for the first, "B" for the next new one, and so on. */
  label: string;
  /** Which of the lines sing it, by their index in the arrangement. */
  lines: number[];
  /** Of those, the ones that hum it ("ooh") under the others' words. */
  hum: number[];
  /** Who has the tune: "all" as written, "men" (the tenor sings it an octave down), "women" (a duet: the alto in thirds and sixths under it). */
  texture: "all" | "men" | "women";
  /** 0 the tune alone .. 1 everyone. */
  energy: number;
}

export interface Staging {
  phrases: StagedPhrase[];
  /** The plan in a line, for the page: "Soprano alone · Alto joins · everyone from the third phrase". */
  story: string;
}

/** A phrase's shape: the steps between its notes and their lengths, relative to its first. */
function shapeOf(tune: readonly NoteIn[], p: Phrase): { steps: number[]; lengths: number[] } {
  const notes = tune.slice(p.first, p.last + 1);
  const first = notes[0]?.d || 1;
  return { steps: notes.slice(1).map((n, i) => n.midi - notes[i].midi), lengths: notes.map((n) => Math.round((n.d / first) * 4) / 4) };
}

/** How alike two phrases are, 0..1: matching steps and lengths over the longer of the two. */
function likeness(a: ReturnType<typeof shapeOf>, b: ReturnType<typeof shapeOf>): number {
  const n = Math.max(a.steps.length, b.steps.length, 1);
  let same = 0;
  for (let i = 0; i < Math.min(a.steps.length, b.steps.length); i++) if (a.steps[i] === b.steps[i]) same += a.lengths[i + 1] === b.lengths[i + 1] ? 1 : 0.7;
  return same / n;
}

/** The tune's form: a letter for each phrase, the same letter for the same strain. */
export function form(tune: readonly NoteIn[], phrases: readonly Phrase[]): string[] {
  const shapes = phrases.map((p) => shapeOf(tune, p));
  const labels: string[] = [];
  const seen: number[] = [];
  shapes.forEach((s, i) => {
    const match = seen.find((j) => likeness(shapes[j], s) >= 0.75);
    if (match !== undefined) labels.push(labels[match]);
    else {
      labels.push(String.fromCharCode(65 + Math.min(25, seen.length)));
      seen.push(i);
    }
  });
  return labels;
}

/**
 * Phrases the right size to stage: one longer than `most` seconds is parted where a singer would
 * part it, after the longest note near its middle (a line of verse ending on a held note), and
 * the halves again if they are still long; one shorter than `least` (a fragment the reader of the
 * tune cut off) is joined to the next, so that a voice comes in for a whole line.
 */
export function lines(tune: readonly NoteIn[], phrases: readonly Phrase[], most: number, least = 0): Phrase[] {
  const out: Phrase[] = [];
  const part = (p: Phrase) => {
    if (p.end - p.t <= most || p.last - p.first < 3) return void out.push(p);
    const mid = (p.t + p.end) / 2;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = p.first + 1; i < p.last - 1; i++) {
      const n = tune[i];
      // a long note, ending near the middle, wins
      const score = n.d / (p.end - p.t) - Math.abs(n.t + n.d - mid) / (p.end - p.t);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return void out.push(p);
    const cut = tune[best + 1].t;
    part({ first: p.first, last: best, t: p.t, end: tune[best].t + tune[best].d, close: tune[best].t });
    part({ first: best + 1, last: p.last, t: cut, end: p.end, close: p.close });
  };
  phrases.forEach(part);
  if (least <= 0) return out;
  const joined: Phrase[] = [];
  for (const p of out) {
    const last = joined[joined.length - 1];
    if (last && last.end - last.t < least) joined[joined.length - 1] = { first: last.first, last: p.last, t: last.t, end: p.end, close: p.close };
    else joined.push(p);
  }
  // a short last one goes with the one before it
  const tail = joined[joined.length - 1];
  if (joined.length > 1 && tail.end - tail.t < least) {
    const before = joined[joined.length - 2];
    joined.splice(-2, 2, { first: before.first, last: tail.last, t: before.t, end: tail.end, close: tail.close });
  }
  return joined;
}

/**
 * The plan for `names` (the lines of the arrangement, the tune first, then in the order they
 * should come in) over the tune's phrases.
 */
/** The choices a plan is made with; left out, the arranger's first choice of each. */
export interface StageOptions {
  /** The joining voices hum while the choir builds (else they sing the words). */
  hum?: boolean;
  /** How far in everyone sings, as a share of the phrases (0.45). */
  fullAt?: number;
  /** The order the other lines come in: indices into `names` (1, 2, 3 ...). */
  order?: number[];
  /** A long song's lighter phrases: the men then the women, the women then the men, or none. */
  breather?: "men-women" | "women-men" | "none";
}

export function stage(tune: readonly NoteIn[], phrases: readonly Phrase[], names: readonly string[], options: StageOptions = {}): Staging {
  const n = phrases.length;
  const k = names.length;
  const labels = form(tune, phrases);
  const everyone = names.map((_, i) => i);
  if (n < 2 || k < 2) {
    const all = phrases.map((p, i): StagedPhrase => ({ t: p.t, end: p.end, label: labels[i], lines: everyone, hum: [], texture: "all", energy: 1 }));
    return { phrases: all, story: k < 2 ? "" : "Everyone throughout" };
  }

  // The phrase from which everyone sings: about the middle (in a short song, not before the
  // second of three), never the first, and at least the last.
  const full = Math.max(1, Math.min(n - 1, Math.ceil(n * (options.fullAt ?? 0.45))));
  // Who comes in at each phrase before it: one at a time while there is room, else the rest together.
  const entering: number[][] = Array.from({ length: n }, () => []);
  const waiting = options.order?.length === k - 1 ? [...options.order] : everyone.slice(1);
  for (let i = 1; i <= full && waiting.length; i++) {
    const room = full - i + 1;
    const take = Math.max(1, Math.ceil(waiting.length / room));
    entering[i] = waiting.splice(0, take);
  }
  if (waiting.length) entering[full].push(...waiting);

  const out: StagedPhrase[] = [];
  let singing: number[] = [0];
  for (let i = 0; i < n; i++) {
    singing = [...singing, ...entering[i]].sort((a, b) => a - b);
    // Until everyone sings, those who have joined hum under the tune.
    const hum = options.hum !== false && singing.length < k ? singing.filter((l) => l !== 0) : [];
    out.push({ t: phrases[i].t, end: phrases[i].end, label: labels[i], lines: singing, hum, texture: "all", energy: 0 });
  }

  // A breather in a long song, once everyone sings and before the last two phrases: the first new
  // strain, or failing one, a strain that comes twice running (the men take it, the women answer).
  const named = (want: string) => names.findIndex((x) => x.toLowerCase() === want);
  const tenor = named("tenor");
  const bass = named("bass");
  const alto = named("alto");
  const breather = options.breather ?? "men-women";
  if (n >= 7 && k >= 3 && breather !== "none") {
    let at = -1;
    for (let i = full + 1; i < n - 1 && at < 0; i++) if (labels[i] !== labels[0] && !labels.slice(0, i).includes(labels[i])) at = i;
    for (let i = full + 1; i < n - 1 && at < 0; i++) if (labels[i] !== labels[0]) at = i;
    if (at >= 0) {
      const men = tenor >= 0 && bass >= 0;
      const women = (i: number) => Object.assign(out[i], alto >= 0 ? { lines: [0, alto].sort((a, b) => a - b), hum: [], texture: "women" } : { lines: [0, 1], hum: [], texture: "all" });
      const next = at + 1 < n - 1 ? at + 1 : -1;
      // the one answers the other in the next phrase, if it is not the last (everyone sings that)
      if (breather === "women-men") {
        women(at);
        if (men && next >= 0) Object.assign(out[next], { lines: [tenor, bass].sort((a, b) => a - b), hum: [], texture: "men" });
      } else if (men) {
        Object.assign(out[at], { lines: [tenor, bass].sort((a, b) => a - b), hum: [], texture: "men" });
        if (next >= 0) women(next);
      } else women(at);
    }
  }
  for (const p of out) p.energy = k > 1 ? (p.lines.length - 1) / (k - 1) : 1;
  return { phrases: out, story: storyOf(out, names) };
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (i: number) => (ORDINAL[i] ? `the ${ORDINAL[i]} phrase` : `phrase ${i + 1}`);
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The plan in words: who starts, who joins, where everyone sings, where it lightens. */
function storyOf(phrases: StagedPhrase[], names: readonly string[]): string {
  const parts: string[] = [];
  const k = names.length;
  phrases.forEach((p, i) => {
    const before = i ? phrases[i - 1].lines : [];
    if (i === 0) {
      parts.push(p.lines.length === k ? "Everyone" : `${and(p.lines.map((l) => names[l]))} alone`);
      return;
    }
    const joined = p.lines.filter((l) => !before.includes(l));
    const left = before.filter((l) => !p.lines.includes(l));
    if (p.texture === "men") parts.push(`the men take the tune in ${nth(i)}`);
    else if (p.texture === "women") parts.push(`the women answer in ${nth(i)}`);
    else if (p.lines.length === k && before.length < k) parts.push(i === phrases.length - 1 ? "everyone at the end" : `everyone from ${nth(i)}`);
    else if (left.length) parts.push(`${and(p.lines.map((l) => names[l]))} in ${nth(i)}`);
    else if (joined.length) parts.push(`${and(joined.map((l) => names[l]))} ${p.hum.some((l) => joined.includes(l)) ? (joined.length > 1 ? "hum under it" : "hums under it") : joined.length > 1 ? "join" : "joins"}`);
  });
  return parts.map((s, i) => (i ? s : s[0].toUpperCase() + s.slice(1))).join(" · ");
}

/** The windows a line rests in: each phrase it does not sing, out to the middle of the rests around it. */
export function restsOf(staging: Staging, line: number): [number, number][] {
  return spansOf(staging, (p) => !p.lines.includes(line));
}

/** The windows a line hums in. */
export function humsOf(staging: Staging, line: number): [number, number][] {
  return spansOf(staging, (p) => p.lines.includes(line) && p.hum.includes(line));
}

/** The phrases `which` picks, each out to the middle of the rests around it, those that touch joined. */
export function spansOf(staging: Staging, which: (p: StagedPhrase) => boolean): [number, number][] {
  const ph = staging.phrases;
  const out: [number, number][] = [];
  ph.forEach((p, i) => {
    if (!which(p)) return;
    const from = i ? (ph[i - 1].end + p.t) / 2 : -Infinity;
    const to = i < ph.length - 1 ? (p.end + ph[i + 1].t) / 2 : Infinity;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - from) < 1e-9) last[1] = to;
    else out.push([from, to]);
  });
  return out;
}

/** Who has the tune at time t: the phrase's texture (before the first phrase, the first's). */
export function textureAt(staging: Staging, t: number): StagedPhrase["texture"] {
  let x: StagedPhrase["texture"] = staging.phrases[0]?.texture ?? "all";
  for (const p of staging.phrases) if (p.t <= t + 1e-6) x = p.texture;
  return x;
}

/** How full the performance is at time t, 0..1: the phrase it is in (before the first, the first's). */
export function energyAt(staging: Staging, t: number): number {
  let e = staging.phrases[0]?.energy ?? 1;
  for (const p of staging.phrases) if (p.t <= t + 1e-6) e = p.energy;
  return e;
}

/**
 * A score with the windows in `rests` left silent. A word goes whole: it is cut when its middle
 * falls in a window, with every sound inside it; a sound in no word goes by its own middle.
 */
export function silence(score: Score, rests: readonly [number, number][]): Score {
  if (!rests.length) return score;
  const inRest = (t: number) => rests.some(([a, b]) => t >= a && t < b);
  const words = score.words ?? [];
  const cut = words.filter((w) => inRest(w.t + w.d / 2));
  const inCut = (t: number) => cut.some((w) => t >= w.t - 1e-6 && t <= w.t + w.d + 1e-6);
  const inWord = (t: number) => words.some((w) => t >= w.t - 1e-6 && t <= w.t + w.d + 1e-6);
  const phones = score.phones.filter((p) => {
    const mid = p.t + p.d / 2;
    return !(inCut(mid) || (!inWord(mid) && inRest(mid)));
  });
  return { ...score, phones, words: score.words ? words.filter((w) => !cut.includes(w)) : undefined };
}

const inside = (t: number, windows: readonly [number, number][]) => windows.some(([a, b]) => t >= a && t < b);

/**
 * `base` with the windows taken from `insert` instead: a phrase sung another way (on "ooh") put
 * in its place. Sounds go by their middles; the words of the windows go (a hum has none).
 */
export function splice(base: Score, insert: Score, windows: readonly [number, number][]): Score {
  if (!windows.length) return base;
  const mid = (p: { t: number; d: number }) => p.t + p.d / 2;
  const curve = (a: Score["pitch"] | undefined, b: Score["pitch"] | undefined) =>
    a && b ? [...a.filter((p) => !inside(p.t, windows)), ...b.filter((p) => inside(p.t, windows))].sort((x, y) => x.t - y.t) : a;
  return {
    ...base,
    phones: [...base.phones.filter((p) => !inside(mid(p), windows)), ...insert.phones.filter((p) => p.ph !== "_" && inside(mid(p), windows))].sort((x, y) => x.t - y.t),
    pitch: curve(base.pitch, insert.pitch)!,
    vibrato: curve(base.vibrato, insert.vibrato),
    words: base.words?.filter((w) => !inside(w.t + w.d / 2, windows)),
  };
}

/** A lean into a note: sung from the note above for a moment, then settling (an appoggiatura on the vowel). */
export interface Lean {
  /** The note's start and length (seconds), its pitch and the one it leans from (MIDI). */
  t: number;
  d: number;
  midi: number;
  from: number;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** The score with each lean in its pitch: the note above at the note's start, the note itself a moment later. */
export function lean(score: Score, leans: readonly Lean[]): Score {
  if (!leans.length) return score;
  let pitch = score.pitch;
  for (const l of leans) {
    const settle = l.t + Math.min(0.16, 0.22 * l.d);
    pitch = [...pitch.filter((p) => p.t < l.t - 1e-6 || p.t > settle + 1e-6), { t: l.t, v: hz(l.from) }, { t: l.t + 0.6 * (settle - l.t), v: hz(l.from) }, { t: settle, v: hz(l.midi) }].sort((a, b) => a.t - b.t);
  }
  return { ...score, pitch };
}

/** Notes outside the windows: what a line sings, for the band to hear. */
export function heard(notes: readonly NoteIn[], rests: readonly [number, number][]): NoteIn[] {
  return notes.filter((n) => !rests.some(([a, b]) => n.t + n.d / 2 >= a && n.t + n.d / 2 < b));
}
