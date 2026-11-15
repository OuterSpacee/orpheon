/**
 * Orpheon's shared vocabulary: the only file every part of the project reads.
 *
 *   lang/   turns words and notes into a Score        (decides WHEN each sound happens)
 *   voice/  turns a Score or a live Pose into sound   (decides HOW the body makes it)
 *   view/   draws the body from the voice's Telemetry
 *   app/    the page: audio output, controls, modes
 *
 * This file is types and constants only. It is fixed while the parts are being built: add at the
 * end if you must, never rename or reorder.
 */

// ───────────────────────────────────────────────────────────── the body ──

/** Who is singing. */
export interface Body {
  /** Length of the airway from the vocal folds to the lips at rest, in cm. */
  tract: number;
  /** Size of the vocal folds: 0 small and light (a child) to 1 long and heavy (a bass). */
  folds: number;
}

export const BODIES = {
  child: { tract: 11.5, folds: 0.1 },
  soprano: { tract: 14.2, folds: 0.3 },
  alto: { tract: 15.2, folds: 0.45 },
  tenor: { tract: 16.8, folds: 0.7 },
  bass: { tract: 18.4, folds: 1 },
} as const satisfies Record<string, Body>;

/**
 * Where things sit along the airway, as a fraction of its length (0 at the vocal folds, 1 at the
 * lip opening). The voice builds its tube with these; the view draws its anatomy with these; so
 * a tongue that looks like it touches the ridge is one that sounds like it.
 */
export const LANDMARK = {
  /** Top of the larynx tube; below it the airway is narrow whatever the tongue does. */
  larynxTop: 0.1,
  /** The pharynx (the throat behind the tongue) runs from larynxTop to here. */
  velum: 0.5,
  /** Where the soft palate opens the door to the nose. */
  nosePort: 0.5,
  /** Velar closures (k, g, ŋ) land around here. */
  velar: 0.6,
  /** Top of the hard palate (j, ç). */
  palatal: 0.74,
  /** Just behind the ridge (ʃ, ʒ). */
  postalveolar: 0.84,
  /** The gum ridge behind the upper teeth (t, d, n, s, z, l). */
  ridge: 0.89,
  /** The upper teeth (θ, ð; the obstacle that makes s hiss). */
  teeth: 0.95,
  /** The lips (p, b, m; with the teeth, f, v). */
  lips: 1,
} as const;

// ───────────────────────────────────────────────────────────── the pose ──

/**
 * What the body is doing at one instant. The order is the wire order: a pose travels as a
 * Float32Array indexed by POSE.
 */
export const POSE_KEYS = [
  /** Breath pressure under the folds. 0 none, 0.4 quiet speech, 0.6 singing, 1 a shout. */
  "lungs",
  /** Pitch the folds are tuned to, in Hz. */
  "pitch",
  /** How far apart the folds rest. 0 squeezed shut (a glottal stop), 0.3 pressed, 0.5 ordinary voice, 0.7 breathy, 1 wide open (breathing, voiceless sounds). */
  "glottis",
  /** 0 chest voice to 1 falsetto. */
  "register",
  /** Larynx height: -1 lowered (longer, darker tube) to +1 raised. */
  "larynx",
  /** Jaw: 0 teeth together to 1 wide open. */
  "jaw",
  /** Tongue body: 0 pulled back into the throat to 1 pushed forward under the hard palate. */
  "tongueX",
  /** Tongue body: 0 low and flat to 1 high against the roof. */
  "tongueY",
  /** Tongue tip: 0 resting behind the lower teeth to 1 sealed against the roof. */
  "tip",
  /** Where the tip points: 0 the teeth, 0.5 the ridge, 1 behind the ridge. */
  "tipX",
  /** Lip opening: 0 sealed to 1 fully open. */
  "lips",
  /** Lip shape: 0 spread to 1 rounded and pushed forward. */
  "round",
  /** Soft palate: 0 raised (nose shut) to 1 lowered (open to the nose). */
  "velum",
  /** Sides of the tongue: 0 sealed to 1 lowered, so air passes around a closed tip (l). */
  "lateral",
  /** Vibrato depth in cents each way. 0 none; a trained singer is around 35. */
  "vibrato",
] as const;

export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

/** Index of each pose value in its Float32Array: POSE.jaw === 5. */
export const POSE = Object.fromEntries(POSE_KEYS.map((k, i) => [k, i])) as Record<PoseKey, number>;
export const POSE_COUNT = POSE_KEYS.length;

/** The body at rest: mouth slightly open, breathing, silent. */
export const REST: Pose = {
  lungs: 0, pitch: 220, glottis: 1, register: 0, larynx: 0,
  jaw: 0.25, tongueX: 0.5, tongueY: 0.4, tip: 0, tipX: 0.5,
  lips: 0.5, round: 0.2, velum: 1, lateral: 0, vibrato: 0,
};

// ──────────────────────────────────────────────────────────── the score ──

/**
 * Every sound the voice can make, in IPA. lang/ emits only these; voice/ knows how to form each.
 * "_" is a rest: the mouth relaxes and, if there is time, the body breathes in.
 */
export const PHONES = [
  // vowels
  "i", "y", "ɨ", "ɯ", "u", "ɪ", "ʊ", "e", "ø", "o", "ə", "ɛ", "œ", "ɜ", "ʌ", "ɔ", "æ", "a", "ɑ", "ɒ", "ɚ",
  // stops
  "p", "b", "t", "d", "k", "g", "ʔ",
  // nasals
  "m", "n", "ɲ", "ŋ",
  // fricatives
  "ɸ", "β", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "ɕ", "ç", "x", "ɣ", "h",
  // affricates
  "tʃ", "dʒ", "ts", "dz",
  // liquids and glides
  "l", "ʎ", "ɹ", "r", "ɾ", "j", "w",
  // rest
  "_",
] as const;

export type PhoneSymbol = (typeof PHONES)[number];

/**
 * One sound in its slot of time. Slots follow each other; the voice blends across the borders.
 *
 * What a listener hears as the start of the sound lands on `t`:
 *   a vowel, glide, liquid or nasal   its voice arrives (the consonant before it lets go)
 *   a fricative                       the hiss starts
 *   a stop or affricate               the mouth shuts; the slot holds the silence, then the burst
 *                                     and any puff of breath after it, and ends when the next
 *                                     sound's voice arrives
 * The voice may start moving toward a sound before its slot (the lips round early for "oo"); it
 * may not let the sound be heard early. So a sung note's vowel goes exactly on the beat, and the
 * consonants before it take their time from the end of the note before.
 */
export interface Phone {
  ph: PhoneSymbol;
  /** Start of the slot, seconds from the start of the score. */
  t: number;
  /** Length of the slot in seconds. */
  d: number;
  /** 0 unstressed, 1 primary stress, 2 secondary. Louder, longer, clearer as it rises. */
  stress?: 0 | 1 | 2;
}

/** A breakpoint of a curve over time. Values run straight between points and hold past the ends. */
export interface Point {
  t: number;
  v: number;
}

/** A word and when it is said, for captions. */
export interface Word {
  text: string;
  t: number;
  d: number;
}

/** Something to say or sing, fully timed. */
export interface Score {
  /** In time order, not overlapping. A gap between two phones is a rest. */
  phones: Phone[];
  /** Pitch in Hz. Between points it moves evenly in musical pitch (straight in log frequency). */
  pitch: Point[];
  /** Breath pressure, as Pose.lungs. Left out, the voice shapes each phrase itself. */
  lungs?: Point[];
  /** Vibrato depth in cents, as Pose.vibrato. Left out, none. */
  vibrato?: Point[];
  /** Register, as Pose.register. Left out, chest. */
  register?: Point[];
  words?: Word[];
  /** Length of the whole score in seconds. */
  length: number;
  /**
   * Voice quality, as Pose.glottis while the folds are voicing a vowel, a glide, a liquid or a
   * nasal (0.25 pressed, 0.5 ordinary, 0.7 breathy, 0.95 a whisper). Consonants keep the settings
   * they need. Left out, ordinary.
   */
  glottis?: Point[];
}

// ──────────────────────────────────────────────────────────── the voice ──

/**
 * One singer. Runs anywhere: in the AudioWorklet for the page, in bun for tests and offline
 * rendering. `createVoice(sampleRate, body?)` in voice/index.ts makes one.
 */
export interface Voice {
  readonly sampleRate: number;
  /** Seconds of sound rendered so far: this voice's clock. */
  readonly time: number;
  setBody(body: Body): void;
  /** Live control: move toward these values. The body's own inertia smooths the way there. */
  aim(pose: Partial<Pose>): void;
  /**
   * Perform a score. Its t = 0 lands at voice time `at` (default: now). Replaces anything
   * already scheduled from `at` on. While a score plays it owns the pose; aim() takes over
   * again when it ends.
   */
  perform(score: Score, at?: number): void;
  /** Drop the score and return to rest. */
  hush(): void;
  /** Write the next out.length samples (mono, -1..1). Must not allocate. */
  render(out: Float32Array): void;
  /** Write the present state into `into`, laid out as TELEMETRY describes. Must not allocate. */
  sense(into: Float32Array): void;
}

// ──────────────────────────────────────────────────────── the telemetry ──

/** How many points describe the airway from the folds (0) to the lips (last), evenly spaced. */
export const TRACT_POINTS = 48;
/** How many points describe the nose from the port (0) to the nostrils (last). */
export const NOSE_POINTS = 24;

/**
 * Layout of the Float32Array that sense() fills: the body's state, as often as the page asks.
 * Scalars first, then arrays. Offsets are in floats.
 */
export const TELEMETRY = {
  /** Voice clock in seconds. */
  time: 0,
  /** Loudness leaving the lips and nose, 0..1 (1 = a full sung vowel). */
  level: 1,
  /** Pitch actually sounding in Hz, vibrato included; 0 when the folds are not vibrating. */
  f0: 2,
  /** How strongly the folds are vibrating, 0..1. */
  voiced: 3,
  /** Where the folds are in their cycle, 0..1 (0 = the instant they open). With f0, lets the view strobe them. */
  foldPhase: 4,
  /** Average gap between the folds, 0 shut .. 1 wide. */
  foldOpen: 5,
  /** Air flowing out through the folds, 0..1 (1 = a strong breathy flow). Negative while breathing in. */
  flow: 6,
  /** Pressure in the lungs, 0..1. */
  lung: 7,
  /** Index into the score's phones of the sound being made now, or -1. */
  phone: 8,
  /** Air pressure held behind a closure in the mouth, 0..1 (what a p or t releases). */
  held: 9,
  // 10..15 spare
  /** POSE_COUNT floats: the pose as it is now, after inertia. */
  pose: 16,
  /** TRACT_POINTS floats: cross-section of the airway in cm², folds to lips. */
  area: 32,
  /** NOSE_POINTS floats: cross-section of the nose in cm², port to nostrils. Zero at the port when the velum is shut. */
  noseArea: 80,
  /** TRACT_POINTS floats: how loud the sound is at each point, 0..1, averaged over about 20 ms. The standing wave: bright bands are where the resonances live. */
  pressure: 104,
  /** NOSE_POINTS floats: the same in the nose. */
  nosePressure: 152,
  /** TRACT_POINTS floats: turbulence being made at each point, 0..1 (the hiss of s, the burst of t). */
  noise: 176,
} as const;

export const TELEMETRY_SIZE = 224;

// ───────────────────────────────────────────────────────────── the view ──

/** The parts of the body the view can show, hide, or show alone. */
export const LAYERS = [
  { id: "skin", name: "Skin", does: "The face and neck: what a listener sees." },
  { id: "bone", name: "Skull and jaw", does: "The jaw swings open to make room; the teeth give s its hiss." },
  { id: "tongue", name: "Tongue", does: "Shapes the tube. Where it bunches decides the vowel." },
  { id: "lips", name: "Lips", does: "The end of the tube. Rounding them lengthens it and darkens the sound." },
  { id: "palate", name: "Palate", does: "The roof of the mouth. Its soft back half is the door to the nose." },
  { id: "nose", name: "Nose", does: "A second tube, open only for m, n and ng." },
  { id: "air", name: "Air", does: "The column of air that actually rings. Bright bands are its resonances." },
  { id: "larynx", name: "Larynx", does: "Two folds that chop the breath into pulses: the pitch." },
  { id: "lungs", name: "Lungs", does: "The bellows. More pressure, more sound." },
  { id: "sound", name: "Sound", does: "What leaves the mouth and reaches a listener." },
] as const;

export type LayerId = (typeof LAYERS)[number]["id"];

/**
 * The body, drawn. `createAnatomyView(canvas)` in view/index.ts makes one. It runs its own
 * animation loop and handles its own pointer input for turning the head.
 */
export interface AnatomyView {
  /** Hand over the newest telemetry. Cheap; call as often as it arrives. */
  frame(telemetry: Float32Array): void;
  /** Show a part: 0 hidden to 1 fully there. */
  layer(id: LayerId, amount: number): void;
  /** Show one part alone, the rest as a faint ghost. null brings everything back. */
  solo(id: LayerId | null): void;
  /** 0 assembled to 1 the parts drift apart so each can be seen. */
  explode(amount: number): void;
  /** 0 the whole head to 1 sliced down the middle, showing the inside. */
  cut(amount: number): void;
  /** Point the camera: yaw and pitch in radians (0, 0 = the profile facing right), zoom 1 = the whole head. */
  look(yaw: number, pitch: number, zoom: number): void;
  /** Called when the user drags a part of the body: the pose values that drag asks for. */
  onGrab: ((pose: Partial<Pose>) => void) | null;
  /** Called when the pointer moves onto or off a part. */
  onHover: ((id: LayerId | null) => void) | null;
  dispose(): void;
}

// ───────────────────────────────────────────────────────────── the band ──
//
// Instruments that play under the voices: each a small physical model (a plucked or bowed
// string, a struck membrane, an air jet), built like the voice, so it runs in the same
// AudioWorklet and the same offline render. `createInstrument(id, sampleRate)` in
// src/band/index.ts makes one.

export const INSTRUMENTS = [
  { id: "bass", name: "Bass", family: "low", does: "A plucked double bass that walks under the harmony." },
  { id: "strings", name: "Strings", family: "sustain", does: "A bowed string section holding the chords." },
  { id: "harp", name: "Harp", family: "plucked", does: "Plucked strings that spread the chords out in time." },
  { id: "guitar", name: "Guitar", family: "plucked", does: "A steel-string guitar, strummed or picked." },
  { id: "piano", name: "Piano", family: "struck", does: "Hammers on strings: chords and a bass hand." },
  { id: "flute", name: "Flute", family: "wind", does: "A jet of air across a pipe, doubling or answering the tune." },
  { id: "timpani", name: "Timpani", family: "drums", does: "Tuned kettle drums on the strong beats." },
  { id: "kit", name: "Drum kit", family: "drums", does: "Kick, snare and hi-hat keeping time." },
  { id: "tanpura", name: "Tanpura", family: "drone", does: "A drone of buzzing open strings on the key's root and fifth." },
  { id: "tabla", name: "Tabla", family: "drums", does: "A pair of hand drums, a bright one and a deep one." },
  { id: "sarod", name: "Sarod", family: "plucked", does: "Steel strings plucked over a skin, bright and singing: the tune and the broken chords." },
  { id: "esraj", name: "Esraj", family: "sustain", does: "A bowed string with sympathetic strings, holding the harmony softly." },
] as const;

export type InstrumentId = (typeof INSTRUMENTS)[number]["id"];

/** One note for an instrument. For drums `midi` picks the drum (General MIDI percussion numbers for the kit; 0 low, 1 high for the tabla and timpani pitch otherwise). */
export interface BandNote {
  t: number;
  d: number;
  midi: number;
  /** 0..1, how hard it is played. */
  velocity: number;
}

/** What one instrument plays in a performance. */
export interface BandPart {
  instrument: InstrumentId;
  /** What the page calls it ("Bass", "Strings from the file's track 3"). */
  name: string;
  notes: BandNote[];
  /** 0..1, and -1 far left to +1 far right. */
  level: number;
  place: number;
}

/** How many floats an instrument's sense() writes: its state for drawing (string shapes, a membrane's rings). */
export const INSTRUMENT_TELEMETRY_SIZE = 64;

/** One instrument. The same rules as the voice: no allocation in render, block-size independent, any sample rate, deterministic. */
export interface Instrument {
  readonly sampleRate: number;
  readonly time: number;
  /** Play these notes; t = 0 lands at instrument time `at` (default now). Replaces what was scheduled from `at` on. */
  perform(notes: BandNote[], at?: number): void;
  /** Sound one note now, for playing live (velocity 0 releases it). */
  strike(midi: number, velocity: number): void;
  hush(): void;
  render(out: Float32Array): void;
  /** Loudness first (index 0, 0..1), then whatever the instrument's drawing needs, up to INSTRUMENT_TELEMETRY_SIZE. */
  sense(into: Float32Array): void;
}
