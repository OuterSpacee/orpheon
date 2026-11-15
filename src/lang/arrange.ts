/**
 * A bare tune made into a choir and a band. The page calls these for every song, built in or
 * imported, so that any tune can be sung in parts with instruments under it.
 *
 *   analyse(notes)          key, tempo, meter, phrases and chords (harmony.ts)
 *   arrange(notes, opts)    up to six sung lines (voicing.ts) and the band's parts (band-parts.ts)
 *   suggestBand(analysis)   the instruments that suit the tune's character
 *
 * The styles:
 *   hymn    every line sings the words, note for note with the tune (homophonic), so the same
 *           lyrics fit every line the same way
 *   oohs    the tune sings the words; the other lines hold the chord on "ooh" (the bass on
 *           "ah"), moving when the harmony moves, breathing where the tune's phrases end
 *   staged  a hymn with a shape (staging.ts): the tune alone first, the voices coming in one by
 *           one, everyone by about the middle, a lighter phrase on a new strain in a long song,
 *           everyone to the end; the band grows with it. Each line keeps the whole song's words
 *           and `rests` says which spans of it are cut out
 *   round   the tune against itself, each voice a phrase later, when that sounds well (checked
 *           on every beat where two entries overlap); when it does not, `round.works` is false,
 *           `round.why` says why, and the lines are a hymn instead
 *
 * With five voices a descant goes over the tune (a child's voice); with six the tune is also
 * doubled, because the words carry the song.
 */
import { BODIES, type BandPart, type InstrumentId } from "../contract.ts";
import type { NoteIn } from "./index.ts";
import { type Chord, chordAt, findChords, findKey, findMeter, findPhrases, keyName, type Phrase, pc, tidyNotes } from "./harmony.ts";
import { type Moment, type PartName, RANGES, voiceDescant, voiceParts, BREATH } from "./voicing.ts";
import { writeBand } from "./band-parts.ts";
import { energyAt, humsOf, type Lean, lines as stageLines, restsOf, stage, type Staging, textureAt } from "./staging.ts";
import { agreement, choices, offerOrder, shapeScore, signature, voicesScore, type Prefer } from "./critic.ts";

export type { Chord, Phrase } from "./harmony.ts";

/** What the arranger hears in a tune. */
export interface Analysis {
  /** Tonic as a pitch class (0 = C) and mode. */
  key: { tonic: number; mode: "major" | "minor" };
  /** Beats per minute and beats per bar. */
  tempo: number;
  meter: number;
  /** One chord per span, as pitch classes with the root first. */
  chords: Chord[];
  /** "G major", for showing. */
  keyName: string;
  /** How well the key profile fits (a correlation, -1..1): low means the key is a guess. */
  keyStrength: number;
  /** Seconds a beat, and the time of the first downbeat (a pickup comes before it). */
  beat: number;
  downbeat: number;
  /** How the beat divides: 2 simple, 3 compound (a 6/8 is meter 2 with division 3). */
  division: 2 | 3;
  phrases: Phrase[];
  /** What kind of tune it seems, as the band that suits it best: what suggestBand() goes by. */
  character: Character;
  /** The tune's lowest and highest notes. */
  low: number;
  high: number;
}

/** One sung line of an arrangement. */
export interface VoiceLine {
  name: string;
  body: keyof typeof BODIES;
  notes: NoteIn[];
  /** The words this line sings; the tune's own for the melody, a syllable like "ah" or "doo" for the others, or the same words. */
  lyrics: string;
  /** True for the line that carries the tune. */
  tune: boolean;
  /** Which part it is, top-down: "descant", "soprano", "alto", "tenor", "bass", or "double" for a second voice on the tune. */
  part: "descant" | "soprano" | "alto" | "tenor" | "bass" | "double";
  /** Staged: the spans of the song (seconds) this line rests in; its words there are not sung. */
  rests?: [number, number][];
  /** Staged: the spans it hums in, under the others' words, and on what (IPA: "u", the bass "a"). */
  hums?: [number, number][];
  hum?: string;
  /** Staged, a slow song: the cadence notes the tune leans into from the note above. */
  leans?: Lean[];
}

export interface Arrangement {
  analysis: Analysis;
  voices: VoiceLine[];
  band: BandPart[];
  /** The style asked for, and the one sung (a round that does not work is sung as a hymn). */
  style: Style;
  /** Staged: who sings each phrase, how full it is, and the plan in a line. */
  staging?: Staging;
  /** Staged: which of the plans the critic ranked this is (0 the best), and how many different ones there were. */
  plans?: { rank: number; count: number };
  /** For a round: whether the tune works as one, how far apart the voices enter (in beats), and why not. */
  round?: { works: boolean; distance: number; why: string };
  /** Semitones the tune was moved so that its singer's range suits it. */
  transpose: number;
}

export interface ArrangeOptions {
  /** How many sung lines, 1 (the tune alone) to 6. */
  voices?: number;
  /** How the other lines sing: the tune's words in harmony, or on a syllable under it. */
  style?: Style;
  /** Staged: which plan, best first (0); "Try another" counts up, and it wraps round. */
  variant?: number;
  /** Staged: what the AI arranger (or anyone) would rather have; the critic weighs it, it does not overrule it. */
  prefer?: Prefer;
  /** Which instruments play; empty for none. Left out, suggestBand() chooses. */
  band?: InstrumentId[];
  lyrics?: string;
}

export type Style = "hymn" | "oohs" | "round" | "staged";

/** Look at a tune: its key, meter and chords. */
/** What a file says of its own meter, which the notes alone may not tell (a 6/8 can sound like a 3/4). */
export interface MeterHint {
  meter: number;
  division: 2 | 3;
}

export function analyse(notes: NoteIn[], hint?: MeterHint): Analysis {
  const tune = tidyNotes(notes);
  if (!tune.length) {
    return { key: { tonic: 0, mode: "major" }, tempo: 100, meter: 4, chords: [], keyName: "C major", keyStrength: 0, beat: 0.6, downbeat: 0, division: 2, phrases: [], character: "hymn", low: 60, high: 60 };
  }
  const key = findKey(tune);
  const meter = findMeter(tune);
  const phrases = findPhrases(tune);
  const chords = findChords(tune, key, meter, phrases);
  const low = Math.min(...tune.map((n) => n.midi));
  const high = Math.max(...tune.map((n) => n.midi));
  const tempo = 60 / meter.beat;
  return {
    key: { tonic: key.tonic, mode: key.mode },
    tempo,
    meter: meter.meter,
    chords,
    keyName: keyName(key),
    keyStrength: key.strength,
    beat: meter.beat,
    downbeat: meter.downbeat,
    division: meter.division,
    phrases,
    character: character(tune, key.mode, tempo, meter.beat, hint?.meter ?? meter.meter, hint?.division ?? meter.division, chords),
    low,
    high,
  };
}

/** The kinds of tune the band knows, each with the ensemble that suits it. */
export type Character = "nursery" | "anthem" | "hymn" | "carol" | "folk" | "ballad" | "waltz" | "lyrical" | "pop" | "jig" | "raga";

/**
 * Each kind of tune: what such a tune measures like (the middle of its kind), the instruments
 * that suit it, best first, and a few words for the page. The measures are the tune's own:
 * tempo (bpm), notes a beat, the share of its moves that are steps (two semitones or less) and
 * leaps (five or more), its range in semitones, and chords a bar.
 */
export const KINDS: Record<Character, { centre: [number, number, number, number, number, number]; band: InstrumentId[]; says: string }> = {
  // a small, stepwise major tune: plucked and blown, light as a music box
  nursery: { centre: [104, 0.9, 0.9, 0.08, 8, 1.6], band: ["harp", "flute", "bass"], says: "a small, light tune" },
  // stepwise, even and bright, marching on the beat: the full orchestra's colours
  anthem: { centre: [116, 1.0, 0.93, 0.04, 12, 1.5], band: ["strings", "harp", "timpani", "bass"], says: "a bright tune that marches" },
  // long even notes, a chord to most of them: a chorale held by strings, the drums at cadences
  hymn: { centre: [92, 0.66, 0.77, 0.1, 12, 1.3], band: ["strings", "bass", "timpani"], says: "a chorale in long notes" },
  // a stately tune with leaps: strings and a flute over the timpani, as a carol is played
  carol: { centre: [104, 0.8, 0.8, 0.16, 12, 1.2], band: ["strings", "flute", "timpani", "bass"], says: "a stately carol" },
  // busy and leaping, a round or a dance song: a guitar picks, a flute answers
  folk: { centre: [112, 1.05, 0.65, 0.16, 14, 0.9], band: ["guitar", "flute", "bass"], says: "a lively folk tune" },
  // slow, in three, with leaps: a piano carries it, strings hold it
  ballad: { centre: [80, 0.75, 0.4, 0.15, 12, 0.6], band: ["piano", "strings", "bass"], says: "a slow song that leaps" },
  // in three and moving: the piano's waltz, the harp's colour
  waltz: { centre: [120, 0.9, 0.75, 0.1, 12, 0.8], band: ["piano", "harp", "bass"], says: "a tune in three that sways" },
  // minor and slow: strings, piano, a flute's sigh
  lyrical: { centre: [80, 0.7, 0.8, 0.1, 12, 1.0], band: ["strings", "piano", "flute"], says: "a slow minor song" },
  // fast and busy: a rhythm section
  pop: { centre: [138, 1.1, 0.85, 0.08, 12, 1.5], band: ["kit", "bass", "guitar", "piano"], says: "a fast song with a beat" },
  // a compound beat (6/8): a guitar, a flute, a light kit
  jig: { centre: [116, 1.2, 0.75, 0.12, 12, 1.0], band: ["guitar", "flute", "bass", "kit"], says: "a dance in six" },
  // one chord nearly throughout: a drone, its strings and the tabla
  raga: { centre: [100, 0.8, 0.85, 0.06, 12, 0.5], band: ["tanpura", "sarod", "esraj", "tabla"], says: "a tune over one chord" },
};

/** How far a measure may stray from a kind's middle and still be like it: one unit of distance. */
const SPREAD = [14, 0.12, 0.1, 0.04, 2.5, 0.35];

/** The tune's measures, in the order of KINDS' centres. */
export function measures(tune: NoteIn[], tempo: number, beat: number, meter: number, chords: Chord[]): [number, number, number, number, number, number] {
  const first = tune[0];
  const last = tune[tune.length - 1];
  const seconds = Math.max(beat, last.t + last.d - first.t);
  let steps = 0;
  let leaps = 0;
  for (let i = 1; i < tune.length; i++) {
    const d = Math.abs(tune[i].midi - tune[i - 1].midi);
    if (d <= 2) steps++;
    if (d >= 5) leaps++;
  }
  const moves = Math.max(1, tune.length - 1);
  const pitches = tune.map((n) => n.midi);
  return [tempo, tune.length / (seconds / beat), steps / moves, leaps / moves, Math.max(...pitches) - Math.min(...pitches), chords.length / Math.max(1, seconds / (beat * meter))];
}

/**
 * What kind of tune: the kind whose middle its measures are nearest, nudged by what the measures
 * cannot see: its meter and how the beat divides, its mode, and a tempo too fast for anything but
 * a beat. A tune that stays on its tonic chord is a drone's, before anything else.
 */
function character(tune: NoteIn[], mode: "major" | "minor", tempo: number, beat: number, meter: number, division: 2 | 3, chords: Chord[]): Character {
  if (tune.length < 2) return "hymn";
  const m = measures(tune, tempo, beat, meter, chords);
  const total = chords.reduce((s, c) => s + c.d, 0) || 1;
  const onTonic = chords.filter((c) => c.roman === "I" || c.roman === "i").reduce((s, c) => s + c.d, 0) / total;
  // A tune that hardly leaves its tonic chord sits on a drone, whatever else it is like.
  if (onTonic > 0.8 && tune.length > 8) return "raga";
  let best: Character = "hymn";
  let bestScore = -Infinity;
  for (const kind of Object.keys(KINDS) as Character[]) {
    const centre = KINDS[kind].centre;
    let score = -centre.reduce((sum, c, i) => sum + ((m[i] - c) / SPREAD[i]) ** 2, 0);
    const three = meter === 3 && division === 2;
    if (kind === "ballad" || kind === "waltz") score += three ? 6 : -6;
    else if (three) score -= 3;
    if (kind === "jig") score += division === 3 ? 8 : -8;
    if (kind === "lyrical") score += mode === "minor" ? 5 : -5;
    if (kind === "nursery" || kind === "anthem") score += mode === "major" ? 1 : -3;
    if (kind === "pop") score += tempo >= 126 ? 6 : -2;
    if (kind === "raga") continue;
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  }
  return best;
}

/** The instruments that suit a tune, best first (what the page ticks by default). */
export function suggestBand(analysis: Analysis): InstrumentId[] {
  return [...KINDS[analysis.character].band];
}

/** Whole octaves that bring a line into a range, keeping its middle near the range's middle. */
function octaveShift(notes: readonly NoteIn[], [lo, hi]: [number, number]): number {
  const pitches = notes.map((n) => n.midi);
  const low = Math.min(...pitches);
  const high = Math.max(...pitches);
  const mid = (low + high) / 2;
  let best = { shift: 0, cost: Infinity };
  for (let shift = -36; shift <= 36; shift += 12) {
    const outside = Math.max(0, lo - (low + shift)) + Math.max(0, high + shift - hi);
    const cost = outside * 2 + Math.abs(mid + shift - (lo + hi) / 2) * 0.5 + Math.abs(shift) / 24;
    if (cost < best.cost) best = { shift, cost };
  }
  return best.shift;
}

const PART_BODY: Record<VoiceLine["part"], keyof typeof BODIES> = {
  descant: "child",
  soprano: "soprano",
  alto: "alto",
  tenor: "tenor",
  bass: "bass",
  double: "soprano",
};
const PART_NAME: Record<VoiceLine["part"], string> = {
  descant: "Descant",
  soprano: "Soprano",
  alto: "Alto",
  tenor: "Tenor",
  bass: "Bass",
  double: "Soprano II",
};

/** Moments for hymn style: one for every note of the tune. */
function hymnMoments(tune: NoteIn[], chords: Chord[]): Moment[] {
  return tune.map((n, i) => {
    const prev = tune[i - 1];
    const fresh = !prev || n.t - (prev.t + prev.d) >= BREATH;
    const chord = chordAt(chords, n.t + 1e-4);
    const sameChord = !!prev && chordAt(chords, prev.t + 1e-4) === chord;
    return {
      t: n.t,
      d: n.d,
      chord,
      top: n.midi,
      topBefore: fresh ? null : prev.midi,
      topLow: n.midi,
      topHigh: n.midi,
      // a note outside the chord passes over parts that keep theirs
      hold: !fresh && sameChord && !chord.tones.includes(pc(n.midi)),
      fresh,
    };
  });
}

/** Moments for oohs: each phrase cut where the chord changes. */
function oohMoments(tune: NoteIn[], chords: Chord[], phrases: Phrase[]): Moment[] {
  const out: Moment[] = [];
  const sounding = (t: number) => tune.find((n) => n.t <= t + 1e-6 && t < n.t + n.d - 1e-6) ?? null;
  let lastEnd = -Infinity;
  for (const ph of phrases) {
    const cuts = [ph.t, ...chords.map((c) => c.t).filter((t) => t > ph.t + 0.05 && t < ph.end - 0.05), ph.end];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t = cuts[i];
      const end = cuts[i + 1];
      const inside = tune.filter((n) => n.t < end - 1e-6 && n.t + n.d > t + 1e-6);
      const at = sounding(t) ?? inside[0] ?? null;
      const before = sounding(t - 1e-3);
      // a new phrase straight after the last (no rest) is sung on without a break
      const fresh = t - lastEnd >= BREATH;
      out.push({
        t,
        d: end - t,
        chord: chordAt(chords, t + 1e-4),
        top: at ? at.midi : null,
        topBefore: before && !fresh ? before.midi : null,
        topLow: inside.length ? Math.min(...inside.map((n) => n.midi)) : at ? at.midi : null,
        topHigh: inside.length ? Math.max(...inside.map((n) => n.midi)) : at ? at.midi : null,
        hold: false,
        fresh,
      });
      lastEnd = end;
    }
  }
  return out;
}

/** One line of notes from a part's pitches at each moment; in oohs a pitch held across moments is one note. */
function lineOf(moments: readonly Moment[], pitches: readonly (number | null)[], join: boolean): NoteIn[] {
  const out: NoteIn[] = [];
  moments.forEach((m, i) => {
    const p = pitches[i];
    if (p === null || p === undefined) return;
    const last = out[out.length - 1];
    if (join && last && !m.fresh && last.midi === p && Math.abs(last.t + last.d - m.t) < 1e-6) last.d += m.d;
    else out.push({ t: m.t, d: m.d, midi: p });
  });
  return out;
}

/** A syllable for every note, a line of them for every phrase (the lyric fit then puts one on each note). */
function syllableLyrics(notes: readonly NoteIn[], phrases: readonly Phrase[], syllable: string): string {
  const lines: string[] = [];
  for (const ph of phrases) {
    const count = notes.filter((n) => n.t >= ph.t - 1e-6 && n.t < ph.end - 1e-6).length;
    if (count) lines.push(Array(count).fill(syllable).join(" "));
  }
  return lines.join("\n");
}

/**
 * Does the tune sound well against itself `distance` seconds later? Every beat where two of
 * `entries` voices overlap is checked: seconds, sevenths and tritones count against it (a fourth
 * against the lowest voice counts half). Returns the share of weighted beats that sound well.
 */
export function canonFit(tune: NoteIn[], distance: number, entries: number, a: Analysis): number {
  const sounding = (t: number) => tune.find((n) => n.t <= t + 1e-6 && t < n.t + n.d - 1e-6)?.midi ?? null;
  const end = tune[tune.length - 1].t + tune[tune.length - 1].d;
  let good = 0;
  let total = 0;
  for (let t = tune[0].t + distance; t < end; t += a.beat) {
    const k = Math.round((t - a.downbeat) / a.beat);
    // a clash on a weak beat is a passing note; on the downbeat it is heard
    const inBar = ((k % a.meter) + a.meter) % a.meter;
    const w = inBar === 0 ? 2 : a.meter === 4 && inBar === 2 ? 1 : 0.5;
    const voices: number[] = [];
    for (let e = 0; e < entries; e++) {
      const p = sounding(t - e * distance);
      if (p !== null) voices.push(p);
    }
    if (voices.length < 2) continue;
    const lowest = Math.min(...voices);
    let bad = 0;
    for (let i = 0; i < voices.length; i++)
      for (let j = i + 1; j < voices.length; j++) {
        const ic = Math.abs(voices[i] - voices[j]) % 12;
        if (ic === 1 || ic === 2 || ic === 6 || ic === 10 || ic === 11) bad += 1;
        else if (ic === 5 && Math.min(voices[i], voices[j]) === lowest) bad += 0.5;
      }
    total += w;
    good += w * (bad === 0 ? 1 : bad <= 0.5 ? 0.6 : 0);
  }
  return total ? good / total : 0;
}

/** Make a choir and a band for a tune that has only its melody. */
export function arrange(notes: NoteIn[], options: ArrangeOptions = {}): Arrangement {
  const lyrics = options.lyrics ?? "";
  const count = Math.max(1, Math.min(6, Math.round(options.voices ?? 4)));
  const asked = options.style ?? "hymn";
  const raw = tidyNotes(notes);
  const analysis = analyse(raw);
  const band = options.band ?? suggestBand(analysis);
  if (!raw.length) return { analysis, voices: [], band: [], style: asked, transpose: 0 };

  // the tune, moved by octaves into its singer's range
  const soloRange: [number, number] = [48, 72];
  const shift = count === 1 ? octaveShift(raw, soloRange) : octaveShift(raw, RANGES.soprano);
  const tune = raw.map((n) => ({ ...n, midi: n.midi + shift }));
  const shifted: Analysis = { ...analysis, chords: analysis.chords, low: analysis.low + shift, high: analysis.high + shift };
  const end = Math.max(...tune.map((n) => n.t + n.d));

  if (count === 1) {
    const body = pickSoloBody(tune);
    return {
      analysis: shifted,
      voices: [{ name: "Tune", body, notes: tune, lyrics, tune: true, part: "soprano" }],
      band: bandFor(shifted, tune, end, band),
      style: asked,
      transpose: shift,
    };
  }

  let style = asked;
  let round: Arrangement["round"];
  if (asked === "round") {
    round = findRound(tune, shifted, Math.min(4, count));
    if (round.works) return roundArrangement(tune, shifted, count, round, lyrics, band, shift);
    style = "hymn";
  }

  const names: PartName[] = count === 2 ? ["bass"] : count === 3 ? ["alto", "bass"] : ["alto", "tenor", "bass"];
  const moments = style === "oohs" ? oohMoments(tune, shifted.chords, shifted.phrases) : hymnMoments(tune, shifted.chords);
  const pitches = voiceParts(moments, names, shifted.key.tonic);
  const join = style === "oohs";
  const voices: VoiceLine[] = [{ name: PART_NAME.soprano, body: "soprano", notes: tune, lyrics, tune: true, part: "soprano" }];
  names.forEach((name, i) => {
    const line = lineOf(moments, pitches.map((p) => p[i] ?? null), join);
    const words = style === "hymn" || style === "staged" ? lyrics : syllableLyrics(line, shifted.phrases, name === "bass" ? "ah" : "ooh");
    voices.push({ name: PART_NAME[name], body: PART_BODY[name], notes: line, lyrics: words, tune: false, part: name });
  });
  if (count >= 5) {
    // a descant over the tune, kept clear of fifths and octaves with every part
    const others = moments.map((m, e) => [m.top, ...pitches[e]]);
    const descant = voiceDescant(moments, others);
    const line = lineOf(moments, descant, join);
    const fits = line.every((n) => n.midi <= RANGES.descant[1]);
    if (fits && line.length) {
      voices.unshift({ name: PART_NAME.descant, body: PART_BODY.descant, notes: line, lyrics: style === "hymn" || style === "staged" ? lyrics : syllableLyrics(line, shifted.phrases, "ah"), tune: false, part: "descant" });
    }
  }
  while (voices.length < count) voices.push({ name: PART_NAME.double, body: PART_BODY.double, notes: tune.map((n) => ({ ...n })), lyrics, tune: false, part: "double" });
  if (style === "staged") {
    // The tune first, then the voices in the order they come in: the alto (a duet with the
    // tune), the tenor, the bass, and a descant or a second tune once everyone sings.
    const ENTRY: VoiceLine["part"][] = ["soprano", "alto", "tenor", "bass", "descant", "double"];
    const order = voices.map((_, i) => i).sort((a, b) => ENTRY.indexOf(voices[a].part) - ENTRY.indexOf(voices[b].part));
    // Staged phrase by phrase: a phrase of more than four bars parted where a singer would part
    // it, a fragment of less than two joined to the next.
    const bar = shifted.beat * shifted.meter;
    const units = stageLines(tune, shifted.phrases, 4 * bar + 1e-3, 2 * bar - 1e-3);
    const names = order.map((i) => voices[i].name);
    const tuneIndex = voices.findIndex((v) => v.tune);
    // Every plan worth trying, each written out and judged by the critic (critic.ts); the best
    // is sung, and `variant` asks for the next best, and the next.
    const tried: { voices: VoiceLine[]; staging: Staging; score: number }[] = [];
    const seen = new Set<string>();
    for (const choice of choices(names.length)) {
      const plan = stage(tune, units, names, choice);
      const key = signature(plan);
      if (seen.has(key)) continue;
      seen.add(key);
      const written = voices.map((v) => ({ ...v, notes: v.notes.map((n) => ({ ...n })) }));
      order.forEach((v, line) => {
        const rests = restsOf(plan, line);
        if (rests.length) written[v].rests = rests;
        const hums = humsOf(plan, line);
        if (hums.length) Object.assign(written[v], { hums, hum: written[v].part === "bass" ? "a" : "u" });
      });
      const shape = shapeScore(plan, names, shifted.tempo <= 100);
      // The plan's lines are in entry order; the arrangement's in voice order.
      for (const p of plan.phrases) {
        p.lines = p.lines.map((line) => order[line]).sort((a, b) => a - b);
        p.hum = p.hum.map((line) => order[line]);
      }
      textures(written, plan, shifted);
      // a preference weighs as much as a fair amount of shape, never as much as a bad clash
      tried.push({ voices: written, staging: plan, score: shape + voicesScore(written, plan, tuneIndex) + 1.2 * agreement(choice, options.prefer, names) });
    }
    // the best first, then real alternatives (a tie keeps the arranger's first choice first)
    const offered = offerOrder(tried);
    const rank = ((Math.round(options.variant ?? 0) % offered.length) + offered.length) % offered.length;
    const chosen = offered[rank];
    const staging = chosen.staging;
    voices.splice(0, voices.length, ...chosen.voices);
    const tuneVoice = voices.find((v) => v.tune)!;
    const leans = leansOf(tuneVoice.notes, staging, shifted, voices.indexOf(tuneVoice));
    if (leans.length) tuneVoice.leans = leans;
    const sung = voices.map((v) => (v.rests ? v.notes.filter((n) => !v.rests!.some(([a, b]) => n.t + n.d / 2 >= a && n.t + n.d / 2 < b)) : v.notes));
    return { analysis: shifted, voices, band: bandFor(shifted, tune, end, band, (t) => energyAt(staging, t), sung, (t) => textureAt(staging, t)), style, staging, plans: { rank, count: offered.length }, transpose: shift };
  }
  return { analysis: shifted, voices, band: bandFor(shifted, tune, end, band), style, round, transpose: shift };
}

const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10, 11] } as const;
const inKey = (midi: number, a: Analysis) => (SCALE[a.key.mode] as readonly number[]).includes(pc(midi - a.key.tonic));
const during = (n: NoteIn, t0: number, t1: number) => n.t >= t0 - 1e-6 && n.t < t1 - 1e-6;

/**
 * The staged plan's textures, written into the lines' notes (one note for each of the tune's, so
 * the words stay on them): where the men take the tune, the tenor sings it an octave down and the
 * bass stays under him; where the women answer, the alto sings a duet under the tune, in thirds
 * and sixths of the key, chord tones first, moving as little as it can.
 */
function textures(voices: VoiceLine[], staging: Staging, a: Analysis): void {
  const tune = voices.find((v) => v.tune);
  const tenor = voices.find((v) => v.part === "tenor");
  const bass = voices.find((v) => v.part === "bass");
  const alto = voices.find((v) => v.part === "alto");
  if (!tune) return;
  const at = (line: VoiceLine, t: number) => line.notes.find((n) => Math.abs(n.t - t) < 1e-6);
  for (const p of staging.phrases) {
    const sung = tune.notes.filter((n) => during(n, p.t, p.end));
    if (p.texture === "men" && tenor) {
      for (const n of sung) {
        const mine = at(tenor, n.t);
        if (!mine) continue;
        let m = n.midi - 12;
        while (m > RANGES.tenor[1]) m -= 12;
        while (m < RANGES.tenor[0]) m += 12;
        mine.midi = m;
        const under = bass && at(bass, n.t);
        if (under && under.midi > m - 3 && under.midi - 12 >= RANGES.bass[0]) under.midi -= 12;
      }
    }
    if (p.texture === "women" && alto) {
      let prev: number | null = null;
      for (const n of sung) {
        const mine = at(alto, n.t);
        if (!mine) continue;
        const chord = chordAt(a.chords, n.t + 1e-4);
        const options = [n.midi - 3, n.midi - 4, n.midi - 8, n.midi - 9].filter((m) => inKey(m, a) && m >= RANGES.alto[0] && m <= RANGES.alto[1]);
        if (!options.length) continue;
        const score = (m: number) => (chord.tones.includes(pc(m)) ? 0 : 4) + (prev === null ? 0 : Math.abs(m - prev));
        const best = options.reduce((x, y) => (score(y) < score(x) ? y : x));
        mine.midi = best;
        prev = best;
      }
    }
  }
}

/**
 * In a slow song the tune leans into the long last note of a phrase from the note of the key
 * above it, as a singer decorates a cadence (not where it came down from that note already).
 */
function leansOf(tune: NoteIn[], staging: Staging, a: Analysis, line: number): Lean[] {
  if (a.tempo > 104) return [];
  const out: Lean[] = [];
  for (const p of staging.phrases) {
    if (!p.lines.includes(line) || p.hum.includes(line)) continue;
    const notes = tune.filter((n) => during(n, p.t, p.end));
    const last = notes[notes.length - 1];
    const before = notes[notes.length - 2];
    if (!last || last.d < 1.4 * a.beat) continue;
    let from = last.midi + 1;
    while (!inKey(from, a)) from++;
    if (before && before.midi === from) continue;
    out.push({ t: last.t, d: last.d, midi: last.midi, from });
  }
  return out;
}

function pickSoloBody(tune: NoteIn[]): keyof typeof BODIES {
  const mid = (Math.min(...tune.map((n) => n.midi)) + Math.max(...tune.map((n) => n.midi))) / 2;
  return mid >= 65 ? "soprano" : mid >= 60 ? "alto" : mid >= 52 ? "tenor" : "bass";
}

function bandFor(a: Analysis, tune: NoteIn[], end: number, band: readonly InstrumentId[], energy?: (t: number) => number, sung?: NoteIn[][], texture?: (t: number) => "all" | "men" | "women"): BandPart[] {
  return writeBand({ key: a.key, beat: a.beat, meter: a.meter, downbeat: a.downbeat, division: a.division, chords: a.chords, phrases: a.phrases, tune, end, band, energy, sung, texture }, band);
}

/** The share of overlapping beats that must sound well for a round to work. */
const ROUND_FIT = 0.85;

/** The best distance for a round, and whether it works. */
function findRound(tune: NoteIn[], a: Analysis, entries: number): NonNullable<Arrangement["round"]> {
  const bar = a.meter * a.beat;
  const length = tune[tune.length - 1].t + tune[tune.length - 1].d - tune[0].t;
  let best = { works: false, distance: 0, why: "", fit: -1 };
  // two bars apart is the usual distance; then one, four, three
  for (const bars of [2, 1, 4, 3]) {
    const distance = bars * bar;
    // every voice must come in while the first is still singing, with room to overlap
    if (distance * (entries - 1) > length - bar) continue;
    const fit = canonFit(tune, distance, entries, a);
    const works = fit >= ROUND_FIT;
    if ((works && !best.works) || (works === best.works && fit > best.fit + (works ? 0.1 : 0.02))) best = { works, distance: bars * a.meter, why: "", fit };
  }
  if (best.fit < 0) return { works: false, distance: 0, why: "The tune is too short for the voices of a round to overlap, so they sing it as a hymn." };
  const percent = Math.round(best.fit * 100);
  const why = best.works
    ? `The voices enter ${best.distance / a.meter} bar${best.distance / a.meter === 1 ? "" : "s"} apart; ${percent}% of the beats where they overlap sound well.`
    : `The tune clashes with itself as a round: at best ${percent}% of the beats where voices overlap sound well, so the voices sing it as a hymn.`;
  return { works: best.works, distance: best.distance, why };
}

/** A round: every voice sings the whole tune, each entering `distance` beats after the one before. */
function roundArrangement(tune: NoteIn[], a: Analysis, count: number, round: NonNullable<Arrangement["round"]>, lyrics: string, band: readonly InstrumentId[], shift: number): Arrangement {
  const delay = round.distance * a.beat;
  const order: { part: VoiceLine["part"]; octave: number }[] = [
    { part: "soprano", octave: 0 },
    { part: "alto", octave: 0 },
    { part: "tenor", octave: -12 },
    { part: "bass", octave: -12 },
  ];
  const voices: VoiceLine[] = [];
  for (let e = 0; e < Math.min(4, count); e++) {
    const { part, octave } = order[e];
    voices.push({
      name: PART_NAME[part],
      body: PART_BODY[part],
      notes: tune.map((n) => ({ t: n.t + e * delay, d: n.d, midi: n.midi + octave })),
      lyrics,
      tune: e === 0,
      part,
    });
  }
  // more voices than entries double the first entries
  for (let e = 0; voices.length < count; e++) voices.push({ ...voices[e], name: voices[e].name + " II", notes: voices[e].notes.map((n) => ({ ...n })), tune: false, part: "double" });
  // the band plays under everything the round sings: its chords heard from all the entries together
  const all = voices.flatMap((v) => v.notes);
  const end = Math.max(...all.map((n) => n.t + n.d));
  const meter = { beat: a.beat, meter: a.meter, downbeat: a.downbeat, division: a.division };
  const chords = findChords(tidyAll(all), a.key, meter, a.phrases);
  const analysis: Analysis = { ...a, chords };
  // the band's tune is the first voice's, followed by the last entry for the bars it sings alone
  return { analysis, voices, band: writeBand({ key: a.key, ...meter, chords, phrases: a.phrases, tune, end, band }, band), style: "round", round, transpose: shift };
}

/** What the band plays under a choir, and how much later the voices start to make room for its introduction. */
export interface BandPlan {
  band: BandPart[];
  /** Seconds every sung line must move later: the band's introduction plays in front of them. */
  delay: number;
  /** The chords the band plays, on the moved clock (the introduction's among them). */
  chords: Chord[];
}

/** Seconds of silence before the band's first note. */
const BAND_LEAD = 0.3;
/** The longest introduction, in seconds: a phrase, not a verse. */
const INTRO_MOST = 9;

/**
 * The band for a tune and the lines that sing it (the tune among them). The chords are heard from
 * every sung line together, so the band plays the harmony the choir really sings: a written
 * harmony, or a round's entries piled on each other, not chords guessed from the tune alone.
 * With `intro`, the band first plays the tune's last phrase (two to four whole bars) and the
 * voices come in after it: `delay` says how far they move.
 */
export function arrangeBand(tune: readonly NoteIn[], sung: readonly (readonly NoteIn[])[], instruments: readonly InstrumentId[], options: { intro?: boolean; energy?: (t: number) => number; texture?: (t: number) => "all" | "men" | "women" } = {}): BandPlan {
  const raw = tidyNotes(tune);
  if (!raw.length || !instruments.length) return { band: [], delay: 0, chords: [] };
  const a = analyse(raw);
  const meter = { beat: a.beat, meter: a.meter, downbeat: a.downbeat, division: a.division };
  const lines = sung.filter((line) => line.length);
  let chords = lines.length > 1 ? findChords(tidyAll(lines.flat()), a.key, meter, a.phrases) : a.chords;
  if (!chords.length) return { band: [], delay: 0, chords: [] };
  const end = Math.max(...[raw, ...lines].flat().map((n) => n.t + n.d));
  const bar = a.beat * a.meter;

  let start = a.downbeat;
  let intro: NoteIn[] = [];
  if (options.intro && a.phrases.length) {
    // the bars that hold the tune's last phrase, two to four of them
    const last = raw[raw.length - 1];
    const lastBar = Math.floor((last.t + last.d - 1e-3 - a.downbeat) / bar);
    const phraseBar = Math.floor((a.phrases[a.phrases.length - 1].t - a.downbeat) / bar + 0.3);
    let k = Math.max(2, Math.min(4, lastBar - phraseBar + 1));
    while (k > 1 && k * bar > INTRO_MOST) k--;
    const from = a.downbeat + (lastBar - k + 1) * bar;
    start = a.downbeat - k * bar;
    const offset = start - from;
    // the phrase played in front of the voices, stopping short of the first sung note (a pickup)
    const first = Math.min(...[raw, ...lines].map((line) => line[0]?.t ?? Infinity));
    intro = raw
      .filter((n) => n.t >= from - 1e-6 && n.t < from + k * bar - 1e-6)
      .map((n) => ({ t: n.t + offset, d: Math.min(n.d, from + k * bar - n.t), midi: n.midi }))
      .map((n) => ({ ...n, d: Math.min(n.d, first - 0.05 - n.t) }))
      .filter((n) => n.d > 0.05);
    // its chords, and the song's from the first downbeat on
    const introChords: Chord[] = chords
      .filter((c) => c.t < from + k * bar - 1e-6 && c.t + c.d > from + 1e-6)
      .map((c) => {
        const t = Math.max(c.t, from);
        return { ...c, t: t + offset, d: Math.min(c.t + c.d, from + k * bar) - t, cadence: false };
      });
    const song = chords
      .filter((c) => c.t + c.d > a.downbeat + 1e-6)
      .map((c) => (c.t < a.downbeat ? { ...c, t: a.downbeat, d: c.t + c.d - a.downbeat } : c));
    chords = [...introChords, ...song];
  }

  const delay = options.intro ? Math.max(0, BAND_LEAD - start) : 0;
  const later = <T extends { t: number }>(x: T): T => ({ ...x, t: x.t + delay });
  chords = chords.map(later);
  const frame = {
    key: a.key,
    ...meter,
    downbeat: a.downbeat + delay,
    chords,
    phrases: a.phrases.map((p) => ({ ...p, t: p.t + delay, end: p.end + delay, close: p.close + delay })),
    tune: raw.map(later),
    end: end + delay,
    band: instruments,
    start: start + delay,
    intro: intro.map(later),
    sung: lines.map((line) => line.map(later)),
    energy: options.energy ? (t: number) => options.energy!(t - delay) : undefined,
    texture: options.texture ? (t: number) => options.texture!(t - delay) : undefined,
  };
  return { band: writeBand(frame, instruments), delay, chords };
}

/** Every note of several lines as one list for the chord finder (overlaps kept: it weighs them all). */
function tidyAll(notes: NoteIn[]): NoteIn[] {
  return notes.map((n) => ({ ...n, midi: Math.round(n.midi) })).sort((x, y) => x.t - y.t);
}
