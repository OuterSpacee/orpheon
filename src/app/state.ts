// Everything the page remembers, in one object held by the store.
import { LAYERS, REST } from "../contract.ts";
import type { BandPart, LayerId, Pose, Score } from "../contract.ts";
import type { Lang, NoteIn } from "../lang/index.ts";
import type { Wakefulness } from "./audio/sound.ts";
import { PRESETS } from "./instrument/presets.ts";
import { DENSITY_USUAL } from "../view/layers.ts";
import type { Tone } from "./instrument/presets.ts";
import { VOWEL_GUESS } from "./scores.ts";
import type { VowelSpot } from "./scores.ts";
import type { SeatChange, SongSetup } from "./sing/setup.ts";
import type { Tune } from "./songs.ts";

export type Mode = "touch" | "speak" | "sing" | "instrument";
export const MODES: { id: Mode; name: string }[] = [
  { id: "touch", name: "Touch" },
  { id: "speak", name: "Speak" },
  { id: "sing", name: "Sing" },
  { id: "instrument", name: "Instrument" },
];

/** The languages the page offers, each under its own name. A new Lang fails to compile until it is named here. */
export const LANGS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  it: "Italiano",
  ja: "日本語",
  la: "Latina",
  ipa: "Sounds (IPA)",
};

/** One voice's share of a performance. */
export interface Part {
  score: Score;
  /** The body that performs it, on the 0..4 scale. */
  body: number;
  /** 0..1, and -1 far left to +1 far right. */
  level: number;
  place: number;
  /** What the stage writes under this voice's head in a choir ("Tune · soprano", "Bass"). */
  name?: string;
  /** The airway's length as a multiple of the body's own (a preset's giant or tiny); left out, 1. */
  size?: number;
  /** Which singer of the line-up this voice is (several voices sing one line in unison); left out, its own seat. */
  line?: number;
}

/** Something spoken or sung: what is playing, and afterwards what Save keeps. */
export interface Performance {
  kind: "speak" | "sing";
  title: string;
  /** One part for each voice, at most six. The first is the one the caption and the stage follow. */
  parts: Part[];
  /** For a song: the first part's notes as sung, for the piano roll. */
  notes?: NoteIn[];
  /** The instruments playing under the voices, at most eight. */
  band?: BandPart[];
  /** A song written with its own captions: each line in its own script, what it means, and when each syllable is sung. */
  captions?: SongCaption[];
}

/** One line of a song's captions, in seconds on the performance's clock. */
export interface SongCaption {
  t0: number;
  t1: number;
  /** The line as it is written (Bengali, German), whole. */
  text: string;
  /** What it means, in English. */
  en: string;
  /** Each sung piece of `text` and when it starts: joined in order they make `text`. */
  syl: [number, string][];
}

/** How long a performance lasts: its longest part, sung or played. */
export const lengthOf = (p: Performance): number =>
  Math.max(0, ...p.parts.map((part) => part.score.length), ...(p.band ?? []).flatMap((part) => part.notes.map((n) => n.t + n.d)));

export interface State {
  mode: Mode;
  audio: Wakefulness;
  /** Why the audio failed, in words for the person. */
  audioWhy: string;
  /** 0 child .. 4 bass. */
  body: number;
  volume: number;
  room: number;

  // The body on the stage.
  hidden: readonly LayerId[];
  solo: LayerId | null;
  cut: number;
  explode: number;
  /** How thick the cloud of the body is: a share of the particles made (the view's DENSITY_USUAL to start). */
  density: number;
  /** 0 cold starlight .. 1 every part in its own colour. */
  colour: number;

  // Touch.
  /** The articulators as the sliders, the pad and the dragged body have left them. */
  pose: Pose;
  /** Pitch of the voice when no key says otherwise, as a MIDI note. */
  note: number;
  /** Breath pressure while voicing (Pose.lungs). */
  breath: number;
  /** 0 pressed .. 1 breathy. */
  quality: number;
  /** Where this voice forms each vowel the pad marks: asked of the engine when the page starts. */
  vowels: readonly VowelSpot[];
  /** The pad moves the jaw and lips with the tongue, as a mouth saying vowels does. */
  follow: boolean;
  /** Keep voicing with nothing held. */
  latch: boolean;
  /** Octaves the computer keyboard is shifted by. */
  octave: number;
  /** How many voices the keys can sound at once. */
  voices: number;
  midi: "unknown" | "unsupported" | "ask" | "none" | "listening" | "refused";
  midiName: string;

  // Speak.
  text: string;
  lang: Lang;
  /** 1 is an ordinary pace. */
  pace: number;
  /** Semitones above or below the body's own speaking pitch. */
  pitch: number;
  lively: number;
  reading: "idle" | "loading" | "ready" | "failed";

  // Sing.
  /** A built-in song's id, or "imported". */
  song: string;
  imported: Tune | null;
  importing: "no" | "reading" | "failed";
  /** An imported file is also sent to the AI arranger (a brief, not the file), whose advice steers its arrangement. */
  aiArrange: boolean;
  importWhy: string;
  /** Each song's choir and band, by song id ("imported" for the file); what is left out is the song's default (sing/setup.ts). */
  setups: Readonly<Record<string, Partial<SongSetup>>>;
  /** The whole band's level, 0..1. */
  bandLevel: number;
  /** The voice a song is sung with: "own", or an Instrument preset's id. */
  singAs: string;
  /** What the person changed about each singer of the line-up, by its place in it. */
  changes: Readonly<Record<number, SeatChange>>;
  /** The singer shown alone on the stage, by its place in the line-up; -1 shows the whole choir. */
  focus: number;
  /** The person's own words for the chosen tune; null sings the tune's own. */
  lyrics: string | null;
  /** The words are being typed: the guide line explains how they are written. */
  wording: boolean;
  transpose: number;
  tempo: number;
  /** Vibrato on held notes, in cents each way. */
  shimmer: number;

  // Instrument.
  /** The preset last chosen; the tone starts as its own and is then the person's. */
  preset: string;
  tone: Tone;

  // Performing.
  playing: Performance | null;
  last: Performance | null;
  /** 0..1 while a WAV is being rendered, else null. */
  saving: number | null;
  /** A passing remark under the stage ("Link copied."). */
  remark: string;

  // The interface itself.
  /** On a phone: which list is up from the bottom. */
  sheet: "none" | "parts" | "controls" | "more";
  /** Idle while sound plays: the controls have faded. */
  away: boolean;
  /** Dismissed by hand: nothing but the body. */
  alone: boolean;
}

export const INITIAL: State = {
  mode: "touch",
  audio: "asleep",
  audioWhy: "",
  body: 3,
  volume: 0.8,
  room: 0.25,

  hidden: [],
  solo: null,
  cut: 0,
  explode: 0,
  density: DENSITY_USUAL,
  colour: 0,

  // The mouth starts open on "a".
  pose: { ...REST, tongueX: 0.39, tongueY: 0.29, jaw: 0.77, lips: 0.82, round: 0, velum: 0, vibrato: 20 },
  vowels: VOWEL_GUESS,
  note: 57,
  breath: 0.6,
  quality: 0.45,
  follow: true,
  latch: false,
  octave: 0,
  voices: 1,
  midi: "unknown",
  midiName: "",

  text: "",
  lang: "en",
  pace: 1,
  pitch: 0,
  lively: 0.6,
  reading: "idle",

  song: "twinkle",
  imported: null,
  importing: "no",
  aiArrange: true,
  importWhy: "",
  setups: {},
  bandLevel: 0.7,
  singAs: "own",
  changes: {},
  focus: -1,
  lyrics: null,
  wording: false,
  transpose: 0,
  tempo: 1,
  shimmer: 30,

  preset: PRESETS[0].id,
  tone: PRESETS[0].tone,

  playing: null,
  last: null,
  saving: null,
  remark: "",

  sheet: "none",
  away: false,
  alone: false,
};

export const LAYER_IDS = LAYERS.map((l) => l.id) as LayerId[];
