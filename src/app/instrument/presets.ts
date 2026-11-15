// The voice as an instrument: ready-made sounds, each nothing but a way of holding the body.
// Every preset is a pose the voice engine really takes (contract.ts, POSE_KEYS) plus how many
// voices sing each note and how they move; nothing is added after the voice.
import type { Pose, PoseKey } from "../../contract.ts";

/** What the Instrument mode's controls set. */
export interface Tone {
  /** Voices singing each note together, 1..6. */
  unison: number;
  /** Cents between the lowest and highest of them, 0..50: a choir is never quite in tune. */
  detune: number;
  /** How wide they stand, 0 all in the middle to 1 from far left to far right. */
  spread: number;
  /** The vowel: tongue forward (Pose.tongueX) and high (Pose.tongueY), 0..1. */
  x: number;
  y: number;
  /** Breath through the folds: 0 pressed, about 0.36 an ordinary voice, 1 a whisper. */
  noise: number;
  /** Vibrato in cents each way. */
  vibrato: number;
  /** Seconds to swell in and to die away. */
  attack: number;
  release: number;
  /** Octaves above or below where the keys sit for this body. */
  octave: number;
  /** The airway's length, as a multiple of the body's own: 0.6 tiny to 1.5 a giant. */
  size: number;
}

export interface Preset {
  id: string;
  name: string;
  /** What it is, in a sentence, for the guide line. */
  does: string;
  tone: Tone;
  /** The rest of the body's pose, beyond what the controls set (the lips shut for a hum). */
  pose?: Partial<Pose>;
  /** A value moved slowly back and forth while a note sounds (the overtone singer's tongue). */
  sweep?: { key: PoseKey; low: number; high: number; seconds: number };
}

/** An ordinary sung "ah", the start of most presets. */
const AH: Tone = { unison: 1, detune: 0, spread: 0, x: 0.39, y: 0.29, noise: 0.36, vibrato: 30, attack: 0.08, release: 0.35, octave: 0, size: 1 };

export const PRESETS: Preset[] = [
  {
    id: "pad",
    name: "Choir pad",
    does: "Four voices on one held vowel, a little out of tune with each other and spread wide.",
    tone: { ...AH, unison: 4, detune: 16, spread: 0.85, x: 0.25, y: 0.4, noise: 0.45, vibrato: 22, attack: 0.7, release: 1.4 },
  },
  { id: "aah", name: "Solo aah", does: "One singer on an open “ah”.", tone: { ...AH, vibrato: 35 } },
  {
    id: "ooh",
    name: "Ooh pad",
    does: "Three voices on a rounded “oo”, soft at both ends.",
    tone: { ...AH, unison: 3, detune: 10, spread: 0.6, x: 0.66, y: 0.76, noise: 0.42, vibrato: 18, attack: 0.5, release: 1.1 },
  },
  {
    id: "whisper",
    name: "Whisper",
    does: "The folds held open: breath with no voice in it, shaped by the mouth.",
    tone: { ...AH, noise: 1, vibrato: 0, attack: 0.12, release: 0.3 },
  },
  { id: "breathy", name: "Breathy", does: "The folds closing loosely, so breath sounds through the voice.", tone: { ...AH, noise: 0.68, vibrato: 20 } },
  {
    id: "pressed",
    name: "Pressed",
    does: "The folds squeezed together: a hard, bright, buzzing tone.",
    tone: { ...AH, noise: 0.04, vibrato: 12, attack: 0.04 },
    pose: { larynx: 0.4 },
  },
  {
    id: "falsetto",
    name: "Falsetto",
    does: "Only the edges of the folds vibrate: a light, high, flute-like voice.",
    tone: { ...AH, noise: 0.5, octave: 1, vibrato: 25 },
    pose: { register: 1 },
  },
  {
    id: "fry",
    name: "Fry",
    does: "The folds slack and pressed, rattling far below the singing range.",
    tone: { ...AH, noise: 0.06, octave: -2, vibrato: 0, attack: 0.05 },
    pose: { larynx: -0.3 },
  },
  {
    id: "overtone",
    name: "Overtones",
    does: "The tongue's tip and body narrow the mouth so one overtone rings out, and sweep slowly to play a tune on the overtones.",
    tone: { ...AH, x: 0.62, y: 0.78, noise: 0.18, vibrato: 0, attack: 0.15, release: 0.6, octave: -1 },
    pose: { tip: 0.65, tipX: 0.75, jaw: 0.22, lips: 0.35, round: 0.55 },
    sweep: { key: "tongueX", low: 0.45, high: 0.88, seconds: 7 },
  },
  {
    id: "hum",
    name: "Hum",
    does: "Lips closed and the soft palate down: the sound leaves through the nose.",
    tone: { ...AH, x: 0.5, y: 0.45, noise: 0.38, vibrato: 15, attack: 0.15, release: 0.5 },
    pose: { lips: 0, jaw: 0.12, velum: 1, round: 0.2 },
  },
  {
    id: "giant",
    name: "Giant",
    does: "An airway half as long again as a bass's: every resonance falls.",
    tone: { ...AH, size: 1.5, octave: -1, vibrato: 18, attack: 0.25, release: 0.8 },
  },
  {
    id: "tiny",
    name: "Tiny",
    does: "An airway shorter than a child's: every resonance rises.",
    tone: { ...AH, size: 0.62, octave: 1, vibrato: 40 },
  },
];

export const presetById = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

/** The tone's limits, for the controls and for links: [low, high, step]. */
export const TONE_RANGE: Record<keyof Tone, [number, number, number]> = {
  unison: [1, 6, 1],
  detune: [0, 50, 1],
  spread: [0, 1, 0.01],
  x: [0, 1, 0.01],
  y: [0, 1, 0.01],
  noise: [0, 1, 0.01],
  vibrato: [0, 80, 1],
  attack: [0.01, 3, 0.01],
  release: [0.02, 4, 0.01],
  octave: [-2, 2, 1],
  size: [0.6, 1.5, 0.01],
};

/** Pose.glottis for a breath-noise setting: pressed (0.25) through ordinary (0.5) and breathy (0.7) to a whisper (0.95). */
export const glottisFor = (noise: number): number => 0.25 + 0.7 * Math.min(1, Math.max(0, noise));

/** Cents for unison voice `i` of `count`: spread evenly from -detune/2 to +detune/2. */
export const detuneOf = (i: number, count: number, detune: number): number => (count < 2 ? 0 : detune * (i / (count - 1) - 0.5));
