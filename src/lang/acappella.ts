/**
 * A whole imported song as up to five singers: the tune with its words; the other pitched
 * tracks each brought down to one line and sung on syllables that suit what the line does; and
 * the drums as mouth percussion.
 *
 *   tune      the words (or "la"), in the body its range suits
 *   bass      the lowest note of each chord, on "dum"
 *   harmony   a moving inner line, on "doo"
 *   pad       long held chords, on "oo" or "ah", sung through without new consonants
 *   drums     kick "p", snare "pf", rim and clap "k", hi-hat "ts", open hat "tss", cymbal
 *             "tsh", toms "d": the stops of the inventory, with their burst on the beat
 *
 * Each line is moved by whole octaves (so the harmony still holds) into the body whose
 * comfortable range it sits best in. All parts share the song's offset, so they start together.
 *
 * With a band (fileArrangement), a track whose General MIDI program belongs to a family the band
 * has (a bass, strings, a guitar, a piano, a flute, a harp, timpani, the drums) is played by that
 * instrument instead of being sung, so a file's own bass and strings come through. Each track's
 * use can be chosen: sung, played (by its instrument), or left out.
 */
import { BODIES, type BandNote, type BandPart, INSTRUMENTS, type InstrumentId, type Phone, type PhoneSymbol, type Score } from "../contract.ts";
import { PLAYABLE } from "../band/ranges.ts";
import type { NoteIn } from "./index.ts";
import { LANGS } from "./langs.ts";
import { planLyrics } from "./fit.ts";
import { extractMelody } from "./melody.ts";
import type { Syl } from "./phones.ts";
import { DEFAULT_VIBRATO, la, singUnits, type Unit } from "./singing.ts";
import type { SongImport } from "./song.ts";
import type { Lang } from "./langs.ts";
import type { ImportedTrack, MelodyNote } from "./song-types.ts";

export type Role = "tune" | "bass" | "harmony" | "pad" | "drums";

export interface Part {
  name: string;
  role: Role;
  /** the track it was made from */
  track: number;
  body: keyof typeof BODIES;
  /** semitones the line was moved to sit in that body */
  transpose: number;
  score: Score;
}

export interface AcappellaOptions {
  /** at most this many parts (default 5) */
  parts?: number;
  /** tracks not to sing (played by the band, or left out) */
  skip?: readonly number[];
  lang?: Lang;
  vibrato?: number;
}

/** where each body sings comfortably, in MIDI notes */
const RANGE: Record<"soprano" | "alto" | "tenor" | "bass", [number, number]> = {
  soprano: [60, 81],
  alto: [53, 74],
  tenor: [48, 69],
  bass: [40, 64],
};

/** The body and octave shift a line sings best in; bodies already taken cost a little more. */
export function pickBody(midis: number[], taken: Set<string> = new Set()): { body: keyof typeof RANGE; shift: number } {
  const sorted = [...midis].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const mid = sorted[sorted.length >> 1];
  let best = { body: "tenor" as keyof typeof RANGE, shift: 0, cost: Infinity };
  for (const body of Object.keys(RANGE) as (keyof typeof RANGE)[]) {
    const [a, b] = RANGE[body];
    for (let shift = -36; shift <= 36; shift += 12) {
      const outside = Math.max(0, a - (lo + shift)) + Math.max(0, hi + shift - b);
      const cost = outside * 2 + Math.abs(mid + shift - (a + b) / 2) * 0.5 + Math.abs(shift) / 12 + (taken.has(body) ? 3 : 0);
      if (cost < best.cost) best = { body, shift, cost };
    }
  }
  return { body: best.body, shift: best.shift };
}

const syl = (onset: PhoneSymbol[], vowel: PhoneSymbol, coda: PhoneSymbol[] = []): Syl => ({ onset: onset.map((ph) => ({ ph })), nucleus: [{ ph: vowel }], coda: coda.map((ph) => ({ ph })), stress: 1 });

/** the share of a track's sounding time in which two or more of its notes sound together */
function chordShare(track: ImportedTrack): number {
  const edges: [number, number][] = [];
  for (const n of track.notes) edges.push([n.time, 1], [n.time + n.duration, -1]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0;
  let last = 0;
  let sounding = 0;
  let together = 0;
  for (const [t, d] of edges) {
    if (count >= 1) sounding += t - last;
    if (count >= 2) together += t - last;
    count += d;
    last = t;
  }
  return sounding > 0 ? together / sounding : 0;
}

const toNotes = (line: MelodyNote[], offset: number, shift: number): NoteIn[] => line.map((n) => ({ t: n.time + offset, d: n.duration, midi: n.midi + shift }));

/** Units for a backing line: a syllable a note, or for a pad a held vowel through each phrase. */
function backingUnits(notes: NoteIn[], role: Role, vowel: PhoneSymbol): Unit[] {
  return notes.map((n, i) => {
    const prev = notes[i - 1];
    const joined = prev && n.t - (prev.t + prev.d) < 0.05;
    if (role === "pad") return joined ? { kind: "hold" } : { kind: "syl", syl: syl([], vowel), word: -1, text: "" };
    if (role === "bass") return { kind: "syl", syl: n.d > 0.8 ? syl(["d"], "u", ["m"]) : syl(["d"], "ʌ", ["m"]), word: -1, text: "" };
    return { kind: "syl", syl: syl(["d"], "u"), word: -1, text: "" };
  });
}

/** General MIDI drum notes to mouth sounds: the sounds, and how strongly a hit claims the mouth. */
function drumSound(midi: number): { sounds: [PhoneSymbol, number][]; rank: number } {
  // each sound with its length after the beat; stops close 40 ms before it
  if (midi === 35 || midi === 36) return { sounds: [["p", 0.03]], rank: 6 };
  if (midi === 38 || midi === 40) return { sounds: [["p", 0.005], ["f", 0.09]], rank: 5 };
  if (midi === 37 || midi === 39) return { sounds: [["k", 0.03]], rank: 4 };
  if (midi === 49 || midi === 52 || midi === 55 || midi === 57) return { sounds: [["tʃ", 0.03], ["ʃ", 0.28]], rank: 3 };
  if (midi === 46) return { sounds: [["ts", 0.03], ["s", 0.14]], rank: 2 };
  if (midi === 42 || midi === 44 || midi === 51 || midi === 53 || midi === 59 || midi === 54) return { sounds: [["ts", 0.05]], rank: 1 };
  if (midi >= 41 && midi <= 50) return { sounds: [["d", 0.03]], rank: 2 };
  if (midi === 56) return { sounds: [["k", 0.03]], rank: 0 };
  if (midi === 70 || midi === 82 || midi === 69) return { sounds: [["s", 0.06]], rank: 0 };
  return { sounds: [["t", 0.03]], rank: 0 };
}

/** how long a stop's or affricate's closure lasts before the burst on the beat */
const CLOSURE = 0.04;

/** The drum track as a Score of mouth percussion. */
export function drumScore(track: ImportedTrack, offset: number, pitch = 110): Score {
  // one hit per instant: of hits within 30 ms the one that claims the mouth most
  const hits: { t: number; midi: number }[] = [];
  const sorted = [...track.notes].sort((a, b) => a.time - b.time);
  for (const n of sorted) {
    const last = hits[hits.length - 1];
    const t = n.time + offset;
    if (last && t - last.t < 0.03) {
      if (drumSound(n.midi).rank > drumSound(last.midi).rank) last.midi = n.midi;
    } else hits.push({ t, midi: n.midi });
  }
  const phones: Phone[] = [];
  for (let i = 0; i < hits.length; i++) {
    const { sounds } = drumSound(hits[i].midi);
    const next = hits[i + 1]?.t ?? Infinity;
    const prevEnd = phones.length ? phones[phones.length - 1].t + phones[phones.length - 1].d : 0;
    // the closure starts before the beat, but never before the last sound ended
    let t = Math.max(prevEnd, hits[i].t - CLOSURE);
    sounds.forEach(([ph, after], k) => {
      const closing = k === 0 && (ph === "p" || ph === "k" || ph === "t" || ph === "d" || ph === "ts" || ph === "tʃ" || ph === "b");
      let end = k === 0 && closing ? hits[i].t + after : t + after;
      // the next hit's closure cuts this one short
      end = Math.min(end, next - CLOSURE);
      if (end - t > 0.01) phones.push({ ph, t, d: end - t, stress: 1 });
      t = Math.max(t, end);
    });
  }
  const length = (phones.length ? phones[phones.length - 1].t + phones[phones.length - 1].d : 0) + 0.3;
  return { phones, pitch: [{ t: 0, v: pitch }], length };
}

/** Up to five sung parts from an imported song (see the header). */
export function acappella(song: SongImport, options: AcappellaOptions = {}): Part[] {
  const max = Math.max(1, Math.min(5, options.parts ?? 5));
  const vibrato = options.vibrato ?? DEFAULT_VIBRATO;
  const lang = LANGS[options.lang ?? "en"];
  const parts: Part[] = [];
  const taken = new Set<string>();
  const tracks = song.song.tracks;

  if (song.melodyTrack !== null && song.notes.length) {
    const { body, shift } = pickBody(song.notes.map((n) => n.midi));
    taken.add(body);
    // the words go on as sing() puts them, phrase by phrase
    const plan = planLyrics(song.notes.map((n) => ({ ...n, midi: n.midi + shift })), song.lyrics, lang);
    const score = singUnits(plan.notes, plan.units, { vibrato, transpose: 0, filler: la, words: plan.words });
    parts.push({ name: tracks[song.melodyTrack].name || "Tune", role: "tune", track: song.melodyTrack, body, transpose: shift, score });
  }

  const skip = new Set(options.skip ?? []);
  const drums = tracks.find((t) => t.drums && t.notes.length && !skip.has(t.index));
  const room = max - parts.length - (drums ? 1 : 0);
  // the other pitched tracks, the ones that sound longest first
  const others = tracks
    .filter((t) => !t.drums && t.notes.length && t.index !== song.melodyTrack && !skip.has(t.index))
    .map((t) => ({ t, presence: t.notes.reduce((s, n) => s + n.duration, 0) }))
    .sort((a, b) => b.presence - a.presence)
    .slice(0, Math.max(0, room))
    .map((x) => x.t);
  const medians = others.map((t) => {
    const p = t.notes.map((n) => n.midi).sort((a, b) => a - b);
    return p[p.length >> 1];
  });
  const lowest = medians.length ? Math.min(...medians) : Infinity;
  let pads = 0;
  others.forEach((t, i) => {
    const durations = t.notes.map((n) => n.duration).sort((a, b) => a - b);
    const long = durations[durations.length >> 1] > 0.8;
    const role: Role = medians[i] === lowest && medians[i] < 55 ? "bass" : chordShare(t) > 0.3 || long ? "pad" : "harmony";
    const line = extractMelody(t, role === "bass").notes;
    if (!line.length) return;
    const { body, shift } = pickBody(line.map((n) => n.midi), taken);
    taken.add(body);
    const notes = toNotes(line, song.offset, shift);
    const vowel: PhoneSymbol = role === "pad" ? (pads++ % 2 ? "ɑ" : "u") : "u";
    const score = singUnits(notes, backingUnits(notes, role, vowel), {
      vibrato: role === "pad" ? vibrato * 0.5 : role === "bass" ? vibrato * 0.3 : vibrato * 0.6,
      transpose: 0,
      filler: () => syl(["d"], "u"),
      words: [],
    });
    parts.push({ name: t.name || `Track ${t.index + 1}`, role, track: t.index, body, transpose: shift, score });
  });

  if (drums && parts.length < max) {
    const body = (["tenor", "bass", "alto", "soprano"] as const).find((b) => !taken.has(b)) ?? "tenor";
    parts.push({ name: drums.name || "Drums", role: "drums", track: drums.index, body, transpose: 0, score: drumScore(drums, song.offset) });
  }
  return parts;
}

// ─────────────────────────────────────────────────────── with a band ──

/** What a track does in a performance: sung by a voice, played by an instrument, or left out. */
export type TrackUse = "sung" | "out" | InstrumentId;

export interface TrackPlan {
  track: number;
  name: string;
  program: number | null;
  drums: boolean;
  /** what it does */
  use: TrackUse;
  /** what it could do, the default first */
  options: TrackUse[];
}

/**
 * The band's instrument for a General MIDI program (the families of the GM 1 sound set, 1991),
 * or null when the band has none like it. Program numbers count from 0.
 */
export function instrumentFor(program: number | null, drums = false): InstrumentId | null {
  if (drums) return "kit";
  if (program === null) return null;
  if (program <= 7) return "piano"; // pianos
  if (program <= 15) return "harp"; // chromatic percussion: struck and plucked bars and bells
  if (program <= 23) return "strings"; // organs: held chords
  if (program <= 31) return "guitar";
  if (program <= 39) return "bass";
  if (program === 45 || program === 46) return "harp"; // pizzicato strings, orchestral harp
  if (program === 47) return "timpani";
  if (program <= 51) return "strings"; // solo strings and string ensembles
  if (program <= 55) return null; // choir and voice: sung
  if (program <= 63) return null; // brass
  if (program <= 79) return "flute"; // reeds and pipes
  if (program <= 87) return null; // synth leads: sung
  if (program <= 95) return "strings"; // synth pads
  if (program === 104) return "tanpura"; // sitar
  if (program === 105 || program === 106) return "guitar"; // banjo, shamisen
  if (program === 107 || program === 108) return "harp"; // koto, kalimba
  if (program === 110) return "strings"; // fiddle
  if (program === 109 || program === 111) return "flute"; // bagpipe, shanai
  if (program === 116 || program === 117) return "timpani"; // taiko, melodic tom
  return null;
}

/** Each track's use: the choices given, or the default (the tune sung, a track the band can play played, the rest sung). */
export function planTracks(song: SongImport, choices: Readonly<Record<number, TrackUse>> = {}): TrackPlan[] {
  return song.song.tracks
    .filter((t) => t.notes.length)
    .map((t) => {
      const instrument = t.index === song.melodyTrack ? null : instrumentFor(t.program, t.drums);
      const options: TrackUse[] = instrument ? [instrument, "sung", "out"] : ["sung", "out"];
      const asked = choices[t.index];
      const use = asked !== undefined && (options.includes(asked) || asked === "sung" || asked === "out") ? asked : options[0];
      return { track: t.index, name: t.name, program: t.program, drums: t.drums, use, options };
    });
}

/** General MIDI drums the kit has no piece for, moved to the nearest it has (Latin hand drums to toms, shakers to the hat). */
function kitNote(midi: number): number {
  if (midi >= 35 && midi <= 59) return midi;
  if (midi < 35) return 36;
  if (midi <= 68) return midi % 2 ? 48 : 45;
  if (midi <= 70) return 42;
  return 37;
}

/** A track's notes for an instrument: on the song's clock, folded by octaves into the instrument's range. */
function trackNotes(track: ImportedTrack, offset: number, instrument: InstrumentId): BandNote[] {
  const [lo, hi] = PLAYABLE[instrument];
  return track.notes
    .map((n) => {
      let midi = n.midi;
      if (instrument === "kit") midi = kitNote(midi);
      else {
        while (midi < lo) midi += 12;
        while (midi > hi) midi -= 12;
      }
      return { t: n.time + offset, d: Math.max(0.02, n.duration), midi, velocity: Math.max(0.05, Math.min(1, n.velocity / 127)) };
    })
    .sort((a, b) => a.t - b.t);
}

export interface FileArrangement {
  /** the sung parts */
  parts: Part[];
  /** the tracks the band plays */
  band: BandPart[];
  /** every track with notes, and what it does */
  tracks: TrackPlan[];
}

/**
 * A whole imported song as voices and a band: tracks the band can play are played (unless
 * `choices` says otherwise), the rest are sung as acappella() sings them.
 */
export function fileArrangement(song: SongImport, options: AcappellaOptions & { choices?: Readonly<Record<number, TrackUse>> } = {}): FileArrangement {
  const tracks = planTracks(song, options.choices);
  const notSung = tracks.filter((t) => t.use !== "sung").map((t) => t.track);
  const parts = acappella(song, { ...options, skip: [...(options.skip ?? []), ...notSung] });
  const played = tracks.filter((t) => t.use !== "sung" && t.use !== "out");
  const band: BandPart[] = played.map((plan, i) => {
    const track = song.song.tracks[plan.track];
    const instrument = plan.use as InstrumentId;
    const what = INSTRUMENTS.find((x) => x.id === instrument)?.name ?? instrument;
    return {
      instrument,
      name: `${what} from the file's track ${plan.track + 1}${track.name ? ` (${track.name})` : ""}`,
      notes: trackNotes(track, song.offset, instrument),
      level: instrument === "bass" ? 0.75 : 0.6,
      place: played.length < 2 ? 0 : -0.6 + (1.2 * i) / (played.length - 1),
    };
  });
  return { parts, band, tracks };
}
