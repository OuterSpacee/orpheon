// The built-in songs. Every tune and every word here is in the public domain; the notes were
// written out by hand for this file.
//
// A tune is written the way it would be dictated: a note name and octave (C4 is middle C), then
// ":" and its length in beats when that is not 1. "|" is a bar line (checked by the tests),
// "~" after a note ties it to the next one, "r" is a rest.
//
// Lyrics give one syllable to each note, in order: "-" splits a word, "_" carries the syllable
// before it over one more note. Every word of more than one syllable is split by hand, so the
// fit never depends on a dictionary.
import type { BandPart, InstrumentId, Score } from "../contract.ts";
import type { Lang, NoteIn, SongImport } from "../lang/index.ts";
import { BODY_NAMES, octavesToFit } from "./bodies.ts";
import type { Part, SongCaption } from "./state.ts";
import { ANANDALOKE } from "./written/anandaloke.ts";
import { FREUDE } from "./written/freude.ts";
import { GRACE } from "./written/grace.ts";
import { ADESTE } from "./written/adeste.ts";
import { EKLA_CHALO } from "./written/ekla.ts";
import { DANNY } from "./written/danny.ts";

export interface Song {
  id: string;
  title: string;
  /** Where the tune and the words come from, and when. */
  credit: string;
  lang: Lang;
  /** Beats in a bar, and beats a minute. */
  meter: number;
  bpm: number;
  /** The tune: in a song for several voices, the top voice's notes. */
  tune: string;
  lyrics: string;
  /** A song for a choir: its voices, each sung by a body of its own. Left out, one voice sings. */
  voices?: ChoirVoice[];
  /** A song written out whole (written/): beats its own band plays before the voices come in. */
  intro?: number;
  /** Its own band, note for note: the instruments, and their parts on the song's clock. */
  band?: { instruments: InstrumentId[]; parts: (clock: BeatClock) => BandPart[] };
  /** Its own captions, in beats from the voices' first. */
  captions?: BeatCaption[];
}

/** Where a song's beats fall on the performance's clock. */
export interface BeatClock {
  /** Seconds at this beat: 0 is the voices' first, a band's introduction comes before it. */
  at(beat: number): number;
  /** One beat in seconds, at the tempo asked for. */
  beat: number;
}

/** One line of a song's captions, in song beats (state.ts's SongCaption is the same in seconds). */
export interface BeatCaption {
  from: number;
  to: number;
  text: string;
  en: string;
  syl: [number, string][];
}

/** One voice of a song written for a choir. */
export interface ChoirVoice {
  /** What the stage writes under its head. */
  name: string;
  body: (typeof BODY_NAMES)[number];
  /** Its own notes, written like a tune; left out, it sings the song's tune. */
  notes?: string;
  /** Semitones its notes are moved by (the low voices sing a round an octave down). */
  shift?: number;
  /** Beats from the start before it comes in: the voices of a round enter one after another. */
  enters?: number;
  /**
   * Its own words, one piece to each of its notes ("_" carrying the syllable before on), a line
   * to each phrase: it breathes where a line ends. Left out, it sings the song's lyrics.
   */
  lyrics?: string;
}

/** One note of a tune, in beats. */
export interface TuneNote {
  /** Beats from the start of the tune. */
  beat: number;
  beats: number;
  midi: number;
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Read a tune. Returns its notes and the length of each bar in beats. */
export function readTune(tune: string): { notes: TuneNote[]; bars: number[]; beats: number } {
  const notes: TuneNote[] = [];
  const bars: number[] = [];
  let beat = 0;
  let barStart = 0;
  let tied = false;
  for (const token of tune.split(/\s+/).filter(Boolean)) {
    if (token === "|") {
      bars.push(beat - barStart);
      barStart = beat;
      continue;
    }
    const m = /^([A-G])([#b]?)(\d)(?::([\d.]+))?(~?)$/.exec(token) ?? /^(r)()()(?::([\d.]+))?()$/.exec(token);
    if (!m) throw new Error(`not a note: "${token}"`);
    const beats = m[4] ? Number(m[4]) : 1;
    if (m[1] !== "r") {
      const midi = 12 * (Number(m[3]) + 1) + STEPS[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
      const last = notes[notes.length - 1];
      if (tied && last && last.midi === midi) last.beats += beats;
      else notes.push({ beat, beats, midi });
    }
    tied = m[5] === "~";
    beat += beats;
  }
  bars.push(beat - barStart);
  return { notes, bars, beats: beat };
}

/** How many notes the lyrics ask for: one for each syllable and each "_". */
export function syllables(lyrics: string): string[] {
  return lyrics
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.split("-"))
    .filter(Boolean);
}

/** A tune ready for the Sing mode, whatever it came from: a built-in song or an imported file. */
export interface Tune {
  title: string;
  lang: Lang;
  /** Seconds from the first note, at the tune's own pace. */
  notes: NoteIn[];
  lyrics: string;
  /** An imported file keeps everything the reader found, so its other tracks can be sung too. */
  source?: SongImport;
}

export function songTune(song: Song): Tune {
  const beat = 60 / song.bpm;
  const notes = readTune(song.tune).notes.map((n) => ({ t: n.beat * beat, d: n.beats * beat, midi: n.midi }));
  // a song written out whole breathes where its lines end, as its choir does
  return { title: song.title, lang: song.lang, notes: song.captions ? breathed(notes, song.lyrics) : notes, lyrics: song.lyrics };
}

/**
 * Silence before the first note, in seconds. A sung vowel starts exactly on its note, so the
 * consonants before the first vowel, and a breath, need this room (0.3 s is the least).
 */
export const LEAD_IN = 0.4;
/** The same room in an imported file, as the language layer's reader leaves it. */
const FILE_LEAD = 0.5;

/** Lyrics as a person would type them: one phrase to a line, no stray spaces. */
export const tidy = (lyrics: string): string =>
  lyrics
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");

/** The notes as they will be sung: after the lead-in, at `tempo` times the tune's own pace. */
export function timed(notes: NoteIn[], tempo = 1): NoteIn[] {
  return notes.map((n) => ({ t: LEAD_IN + n.t / tempo, d: n.d / tempo, midi: n.midi }));
}

export const SONGS: Song[] = [
  {
    id: "twinkle",
    title: "Twinkle, twinkle, little star",
    credit: "French tune, 1761; words by Jane Taylor, 1806",
    lang: "en",
    meter: 4,
    bpm: 104,
    tune: `C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
           G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
           C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`,
    lyrics: `Twin-kle twin-kle lit-tle star
             how I won-der what you are
             Up a-bove the world so high
             like a dia-mond in the sky
             Twin-kle twin-kle lit-tle star
             how I won-der what you are`,
  },
  {
    id: "joy",
    title: "Ode to joy",
    credit: "Ludwig van Beethoven, 1824; words by Henry van Dyke, 1907",
    lang: "en",
    meter: 4,
    bpm: 116,
    tune: `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 |
           E4 E4 F4 G4 | G4:.5 G4:.5 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 |
           D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 |
           E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2`,
    lyrics: `Joy-ful joy-ful we a-dore thee
             God of glo-ry Lord of love
             Hearts un-fold like flow-ers be-fore thee
             ope-ning to the sun a-bove
             Melt the clouds of sin and _ sad-ness
             drive the _ dark of doubt a-way
             Giv-er of im-mor-tal glad-ness
             fill us with the light of day`,
  },
  GRACE,
  ADESTE,
  {
    // A round: each voice sings the same tune, coming in two bars after the one before, so the
    // voices pile up one by one and leave one by one. Written out twice round, so that all four
    // sing together for a while.
    id: "jacques",
    title: "Are you sleeping? A round for four",
    credit: "French round “Frère Jacques”, printed about 1780; English words traditional",
    lang: "en",
    meter: 4,
    bpm: 108,
    tune: `F4 G4 A4 F4 | F4 G4 A4 F4 | A4 Bb4 C5:2 | A4 Bb4 C5:2 |
           C5:.5 D5:.5 C5:.5 Bb4:.5 A4 F4 | C5:.5 D5:.5 C5:.5 Bb4:.5 A4 F4 | F4 C4 F4:2 | F4 C4 F4:2 |
           F4 G4 A4 F4 | F4 G4 A4 F4 | A4 Bb4 C5:2 | A4 Bb4 C5:2 |
           C5:.5 D5:.5 C5:.5 Bb4:.5 A4 F4 | C5:.5 D5:.5 C5:.5 Bb4:.5 A4 F4 | F4 C4 F4:2 | F4 C4 F4:2`,
    lyrics: `Are you sleep-ing are you sleep-ing
             Bro-ther John Bro-ther John
             Mor-ning bells are ring-ing mor-ning bells are ring-ing
             ding dang dong ding dang dong
             Are you sleep-ing are you sleep-ing
             Bro-ther John Bro-ther John
             Mor-ning bells are ring-ing mor-ning bells are ring-ing
             ding dang dong ding dang dong`,
    voices: [
      { name: "Soprano", body: "soprano" },
      { name: "Alto", body: "alto", enters: 8 },
      { name: "Tenor", body: "tenor", enters: 16, shift: -12 },
      { name: "Bass", body: "bass", enters: 24, shift: -12 },
    ],
  },
  {
    // The Doxology on the Genevan tune, four voices together, a syllable to every chord. The
    // harmony was written for this file; the long first and last notes of each line follow the
    // Genevan rhythm.
    id: "old100",
    title: "Old hundredth, in four parts",
    credit: "Genevan Psalter, 1551; words by Thomas Ken, 1674; harmony written for Orpheon",
    lang: "en",
    meter: 4,
    bpm: 96,
    tune: `G4:2 G4 F#4 | E4 D4 G4 A4 | B4:4 |
           B4:2 B4 B4 | A4 G4 C5 B4 | A4:4 |
           G4:2 A4 B4 | A4 G4 E4 F#4 | G4:4 |
           D5:2 B4 G4 | A4 C5 B4 A4 | G4:4`,
    lyrics: `Praise God from whom all bless-ings flow
             Praise him all crea-tures here be-low
             Praise him a-bove ye heav'n-ly host
             Praise Fa-ther Son and Ho-ly Ghost`,
    voices: [
      { name: "Soprano", body: "soprano" },
      {
        name: "Alto",
        body: "alto",
        notes: `D4:2 D4 D4 | C4 A3 B3 D4 | D4:4 |
                G4:2 G4 G4 | F#4 E4 E4 D4 | D4:4 |
                D4:2 D4 G4 | F#4 E4 C4 D4 | D4:4 |
                G4:2 G4 E4 | F#4 E4 E4 F#4 | D4:4`,
      },
      {
        name: "Tenor",
        body: "tenor",
        notes: `B3:2 B3 A3 | A3 F#3 G3 F#3 | G3:4 |
                D4:2 E4 D4 | D4 B3 A3 B3 | F#3:4 |
                B3:2 A3 D4 | D4 B3 A3 A3 | B3:4 |
                B3:2 D4 C4 | A3 A3 G3 A3 | B3:4`,
      },
      {
        name: "Bass",
        body: "bass",
        notes: `G3:2 B2 D3 | A2 D3 G2 D3 | G2:4 |
                G3:2 E3 B2 | D3 E3 A2 D3 | D3:4 |
                G3:2 F#3 G3 | D3 E3 A2 D3 | G2:4 |
                G3:2 B2 E3 | D3 A2 E3 D3 | G2:4`,
      },
    ],
  },
  // Songs written out whole, each with its own band and captions (written/).
  ANANDALOKE,
  FREUDE,
  EKLA_CHALO,
  DANNY,
];

export const songById = (id: string): Song | undefined => SONGS.find((s) => s.id === id);

/** The tune the state points at, or null (an import that has not happened). */
export function chosenTune(s: { song: string; imported: Tune | null }): Tune | null {
  if (s.song === "imported") return s.imported;
  const song = songById(s.song);
  return song ? songTune(song) : null;
}

/**
 * The notes as this body will sing them: moved by whole octaves to where the body sings most
 * easily, then by the transpose control, at the tempo asked for.
 */
export function plannedNotes(tune: Tune, s: { body: number; transpose: number; tempo: number }): NoteIn[] {
  const pitches = tune.notes.map((n) => n.midi);
  const shift = octavesToFit(Math.min(...pitches), Math.max(...pitches), s.body) + s.transpose;
  return timed(tune.notes, s.tempo).map((n) => ({ ...n, midi: n.midi + shift }));
}

/**
 * An imported file as it would be at `tempo` times its own pace, for the arranger to work from.
 * The file is hurried, not the finished scores, so every consonant still gets its full time; and
 * the first note still waits half a second, because a sung vowel lands exactly on its note and
 * the consonants in front of it need room.
 */
export function atTempo(source: SongImport, tempo: number): SongImport {
  if (tempo === 1) return source;
  const starts = source.song.tracks.flatMap((track) => track.notes.map((n) => n.time / tempo));
  const offset = starts.length ? Math.max(0, FILE_LEAD - Math.min(...starts)) : 0;
  return {
    ...source,
    offset,
    duration: source.song.duration / tempo + offset,
    notes: source.notes.map((n) => ({ t: (n.t - source.offset) / tempo + offset, d: n.d / tempo, midi: n.midi })),
    song: {
      ...source.song,
      duration: source.song.duration / tempo,
      tracks: source.song.tracks.map((track) => ({
        ...track,
        notes: track.notes.map((n) => ({ ...n, time: n.time / tempo, duration: n.duration / tempo })),
        lyrics: track.lyrics.map((l) => ({ ...l, time: l.time / tempo })),
      })),
    },
  };
}

/** One voice of a built-in choir song, planned: its notes in seconds, its body and where it is heard. */
export interface ChoirLine {
  name: string;
  /** On the 0..4 scale of the body control. */
  body: number;
  notes: NoteIn[];
  /** Its own words, when the song gives it some. */
  lyrics?: string;
  level: number;
  place: number;
}

/**
 * A song written for several voices, as each voice will sing it: its own notes (or the tune),
 * moved by its shift and the transpose control, after its entry, at the tempo asked for, with a
 * breath where its own words end a line. The voices stand left to right across the sound in their
 * order; the first is a little louder, as the tune should be.
 */
export function choirLines(song: Song, s: { transpose: number; tempo: number }): ChoirLine[] {
  const voices = song.voices ?? [];
  const beat = 60 / song.bpm;
  return voices.map((voice, i) => {
    const enters = voice.enters ?? 0;
    const notes = readTune(voice.notes ?? song.tune).notes.map((n) => ({
      t: (enters + n.beat) * beat,
      d: n.beats * beat,
      midi: n.midi + (voice.shift ?? 0) + s.transpose,
    }));
    const sung = timed(notes, s.tempo);
    return {
      name: voice.name,
      body: Math.max(0, BODY_NAMES.indexOf(voice.body)),
      notes: voice.lyrics ? breathed(sung, voice.lyrics) : sung,
      ...(voice.lyrics ? { lyrics: voice.lyrics } : {}),
      level: (i === 0 ? 0.7 : 0.6) / Math.max(1, voices.length) ** 0.3,
      place: voices.length < 2 ? 0 : -0.6 + (1.2 * i) / (voices.length - 1),
    };
  });
}

/** Seconds a singer takes to breathe between two phrases sung without a rest. */
const BREATH = 0.15;

/**
 * The notes with a breath taken at the end of each line of the words: the last note of a line is
 * cut short (by at most half) when the next phrase follows straight on. The singing leaves a gap
 * that long silent, so the voice breathes in there.
 */
export function breathed(notes: NoteIn[], lyrics: string): NoteIn[] {
  const out = notes.map((n) => ({ ...n }));
  let at = 0;
  for (const line of lyrics.split("\n").filter((l) => l.trim())) {
    at += syllables(line).length;
    const last = out[at - 1];
    const next = out[at];
    if (!last || !next || next.t - (last.t + last.d) >= BREATH) continue;
    last.d = Math.min(last.d - Math.min(BREATH, last.d / 2), next.t - last.t);
  }
  return out;
}

/** Where a song's beats fall at the tempo asked for: its voices' first beat after the lead-in and `delay` seconds more (a band's introduction). */
export function songClock(song: Song, tempo: number, delay = 0): BeatClock {
  const beat = 60 / song.bpm / tempo;
  return { at: (b) => LEAD_IN + delay + b * beat, beat };
}

/** How long a song's own band plays before its voices, in seconds at the tempo asked for. */
export const introOf = (song: Song, tempo: number): number => ((song.intro ?? 0) * 60) / song.bpm / tempo;

/** A song's own captions on a performance's clock. */
export const captionsAt = (captions: readonly BeatCaption[], clock: BeatClock): SongCaption[] =>
  captions.map((c) => ({ t0: clock.at(c.from), t1: clock.at(c.to), text: c.text, en: c.en, syl: c.syl.map(([b, text]): [number, string] => [clock.at(b), text]) }));

/** Where the voices of a choir stand around the tune, which is in the middle. */
const CHOIR_PLACES = [0, -0.5, 0.5, -0.85, 0.85, 0];

/**
 * An arrangement (the language layer's acappella()) as the parts of one performance: the tune
 * in front and in the middle, the others quieter and spread to the sides.
 */
export function choirParts(arranged: { role: string; body: string; score: Score }[]): Part[] {
  const tuneFirst = [...arranged].sort((a, b) => Number(b.role === "tune") - Number(a.role === "tune"));
  return tuneFirst.slice(0, 6).map((voice, i) => ({
    score: voice.score,
    body: Math.max(0, BODY_NAMES.indexOf(voice.body as (typeof BODY_NAMES)[number])),
    level: voice.role === "tune" ? 0.75 : voice.role === "bass" ? 0.55 : 0.42,
    place: CHOIR_PLACES[i],
    name: roleName(voice.role, voice.body),
  }));
}

/** What the stage writes under a singer of an arrangement: what it sings, and in what body. */
export function roleName(role: string, body: string): string {
  if (role === "drums") return "Mouth drums";
  if (role === "bass" && body === "bass") return "Bass";
  const what = role === "tune" ? "Tune" : role === "bass" ? "Bass line" : role === "pad" ? "Chords" : "Harmony";
  return `${what} · ${body}`;
}
