// Scores written by hand: the consonants of the Touch mode, and what the page performs when the
// language layer gives it nothing. The timing follows the contract: a vowel's voice lands on its
// `t`; a stop's slot begins when the mouth shuts and lasts until the next sound's voice arrives.
import { POSE, POSE_COUNT } from "../contract.ts";
import type { Phone, PhoneSymbol, Point, Score, Word } from "../contract.ts";
import type { NoteIn } from "../lang/index.ts";
import { midiToHz } from "./notes.ts";

type Kind = "vowel" | "stop" | "affricate" | "fricative" | "nasal" | "glide" | "rest";

const KINDS: Record<Exclude<Kind, "vowel">, string> = {
  stop: "p b t d k g ʔ",
  affricate: "tʃ dʒ ts dz",
  fricative: "ɸ β f v θ ð s z ʃ ʒ ɕ ç x ɣ h",
  nasal: "m n ɲ ŋ",
  glide: "l ʎ ɹ r ɾ j w",
  rest: "_",
};

export function kindOf(ph: PhoneSymbol): Kind {
  for (const kind in KINDS) if (KINDS[kind as keyof typeof KINDS].split(" ").includes(ph)) return kind as Kind;
  return "vowel";
}

/**
 * How long a consonant's slot is before a stressed vowel, in seconds. Typical values for
 * careful speech: Klatt, "Synthesis by rule of segmental durations in English sentences" (1979),
 * table of inherent durations, rounded.
 */
const SLOT: Record<Kind, number> = { stop: 0.1, affricate: 0.14, fricative: 0.13, nasal: 0.09, glide: 0.08, vowel: 0.34, rest: 0.1 };

/** The consonants the Touch mode offers, in the order they sit in the mouth, lips to throat. */
export const CONSONANTS: PhoneSymbol[] = ["p", "b", "m", "f", "v", "w", "θ", "t", "d", "n", "s", "z", "l", "ɹ", "ʃ", "tʃ", "dʒ", "j", "k", "g", "ŋ", "h"];

/** What to call each one aloud: a screen reader cannot pronounce "ʃ". */
export const CONSONANT_NAMES: Partial<Record<PhoneSymbol, string>> = {
  θ: "th", ɹ: "r", ʃ: "sh", tʃ: "ch", dʒ: "j", j: "y", ŋ: "ng",
};

/** A short consonant then vowel on one pitch, falling slightly, as a syllable said alone does. */
export function consonantVowel(consonant: PhoneSymbol, vowel: PhoneSymbol, hz: number): Score {
  const start = 0.04;
  const slot = SLOT[kindOf(consonant)];
  const phones: Phone[] = [
    { ph: consonant, t: start, d: slot, stress: 1 },
    { ph: vowel, t: start + slot, d: SLOT.vowel, stress: 1 },
  ];
  const length = start + slot + SLOT.vowel + 0.06;
  return {
    phones,
    pitch: [
      { t: 0, v: hz },
      { t: start + slot, v: hz },
      { t: length, v: hz * 0.94 },
    ],
    words: [{ text: consonant + vowel, t: start, d: slot + SLOT.vowel }],
    length,
  };
}

/** Where the voice puts its mouth for one vowel: a place on the pad, and the jaw and lips that go with it. */
export interface VowelSpot {
  ph: PhoneSymbol;
  /** Tongue forward (Pose.tongueX) and high (Pose.tongueY), each 0..1: the pad's two directions. */
  x: number;
  y: number;
  jaw: number;
  lips: number;
  round: number;
}

/** The vowels the pad marks. */
export const PAD_VOWELS: PhoneSymbol[] = ["i", "e", "ɛ", "a", "ə", "ɑ", "ɔ", "o", "u"];

/**
 * Where this voice forms each of them. These are not the textbook vowel chart: they are what the
 * engine itself reported when asked to perform each vowel (see vowelProbe), written down once so
 * the pad has something to show before the page has asked. The page asks again at every start,
 * so the pad follows the engine if its vowels are ever fitted anew.
 */
export const VOWEL_GUESS: VowelSpot[] = [
  { ph: "i", x: 0.93, y: 0.59, jaw: 0.43, lips: 0.73, round: 0 },
  { ph: "e", x: 0.89, y: 0.35, jaw: 0.39, lips: 0.69, round: 0 },
  { ph: "ɛ", x: 0.75, y: 0.19, jaw: 0.42, lips: 0.72, round: 0 },
  { ph: "a", x: 0.39, y: 0.29, jaw: 0.77, lips: 0.82, round: 0 },
  { ph: "ə", x: 0.58, y: 0.3, jaw: 0.21, lips: 0.58, round: 0.2 },
  { ph: "ɑ", x: 0.09, y: 0.32, jaw: 0.81, lips: 0.8, round: 0.11 },
  { ph: "ɔ", x: 0.06, y: 0.56, jaw: 0.63, lips: 0.57, round: 0.7 },
  { ph: "o", x: 0.46, y: 0.6, jaw: 0.49, lips: 0.45, round: 0.85 },
  { ph: "u", x: 0.66, y: 0.76, jaw: 0.36, lips: 0.35, round: 0.98 },
];

/** One vowel alone for a third of a second: what the page performs to learn how the voice forms it. */
export function vowelProbe(ph: PhoneSymbol): Score {
  return { phones: [{ ph, t: 0.03, d: 0.3, stress: 1 }], pitch: [{ t: 0, v: 150 }], length: 0.36 };
}

/**
 * The spots from what the voice reported: for each vowel, its pose (POSE_COUNT floats, in pose
 * order) at the middle of the probe. A report that makes no sense keeps the guess for that vowel.
 */
export function spotsFrom(phones: PhoneSymbol[], poses: Float32Array): VowelSpot[] {
  return phones.map((ph, i) => {
    const at = (key: "tongueX" | "tongueY" | "jaw" | "lips" | "round") => poses[i * POSE_COUNT + POSE[key]];
    const spot: VowelSpot = { ph, x: at("tongueX"), y: at("tongueY"), jaw: at("jaw"), lips: at("lips"), round: at("round") };
    const sane = [spot.x, spot.y, spot.jaw, spot.lips, spot.round].every((v) => v >= -0.05 && v <= 1.05);
    return sane ? spot : (VOWEL_GUESS.find((g) => g.ph === ph) ?? { ph, x: 0.5, y: 0.3, jaw: 0.5, lips: 0.7, round: 0 });
  });
}

export function nearestVowel(x: number, y: number, spots: readonly VowelSpot[] = VOWEL_GUESS): PhoneSymbol {
  let best = spots[0];
  let near = Infinity;
  for (const v of spots) {
    const d = (v.x - x) ** 2 + (v.y - y) ** 2;
    if (d < near) {
      near = d;
      best = v;
    }
  }
  return best.ph;
}

/**
 * With "follow" on, the jaw and lips go where a mouth saying the vowels around this point of the
 * pad would put them: each vowel pulls far harder the nearer it is (the inverse fourth power of the
 * distance), so around each vowel there is a region that is nearly its mouth, and on its spot exactly.
 */
export function mouthFor(x: number, y: number, spots: readonly VowelSpot[] = VOWEL_GUESS): { jaw: number; lips: number; round: number } {
  let jaw = 0;
  let lips = 0;
  let round = 0;
  let total = 0;
  for (const v of spots) {
    const d = (v.x - x) ** 2 + (v.y - y) ** 2;
    if (d < 1e-6) return { jaw: v.jaw, lips: v.lips, round: v.round };
    const pull = 1 / (d * d);
    jaw += v.jaw * pull;
    lips += v.lips * pull;
    round += v.round * pull;
    total += pull;
  }
  return { jaw: jaw / total, lips: lips / total, round: round / total };
}

/** "Hello", said by hand: the one line the voice knows without the language layer. */
export function helloScore(hz: number): Score {
  const sounds: [PhoneSymbol, number, (0 | 1)?][] = [
    ["h", 0.09],
    ["ə", 0.09],
    ["l", 0.08],
    ["o", 0.2, 1],
    ["ʊ", 0.16],
  ];
  let t = 0.08;
  const phones: Phone[] = sounds.map(([ph, d, stress]) => {
    const phone: Phone = { ph, t, d, stress: stress ?? 0 };
    t += d;
    return phone;
  });
  const length = t + 0.12;
  return {
    phones,
    pitch: [
      { t: 0, v: hz * 0.97 },
      { t: 0.3, v: hz * 1.16 },
      { t: length, v: hz * 0.8 },
    ],
    words: [{ text: "hello", t: 0.08, d: t - 0.08 }],
    length,
  };
}

/** The consonant in front of each sung "la" takes this long, borrowed from the end of the note before. */
const LA_ONSET = 0.07;

/**
 * A tune sung on "la", written by hand: what Sing performs when the language layer returns an
 * empty score. `words` (one for each note, when they fit) only label the caption.
 */
export function laScore(notes: NoteIn[], words: string[] = [], vibrato = 0): Score {
  const phones: Phone[] = [];
  const pitch: Point[] = [];
  const captions: Word[] = [];
  const labelled = words.length === notes.length;
  notes.forEach((note, i) => {
    const next = notes[i + 1];
    // The vowel ends where the next note's consonant begins, or a little before a silence.
    const joined = next !== undefined && next.t - (note.t + note.d) < 0.05;
    const end = joined ? next.t - LA_ONSET : note.t + note.d;
    const before = i === 0 ? 0 : notes[i - 1].t + notes[i - 1].d;
    phones.push({ ph: "l", t: Math.max(before - LA_ONSET, note.t - LA_ONSET), d: LA_ONSET, stress: 1 });
    phones.push({ ph: "a", t: note.t, d: Math.max(0.04, end - note.t), stress: 1 });
    const hz = midiToHz(note.midi);
    // The pitch steps to the new note in the last moments of the consonant.
    pitch.push({ t: Math.max(0, note.t - 0.04), v: i === 0 ? hz : midiToHz(notes[i - 1].midi) }, { t: note.t, v: hz });
    const held = labelled && words[i] === "_";
    if (held && captions.length) captions[captions.length - 1].d = note.t + note.d - captions[captions.length - 1].t;
    else captions.push({ text: labelled ? words[i] : "la", t: note.t - LA_ONSET, d: note.d + LA_ONSET });
  });
  // Keep the phones in time order and apart, whatever the notes did.
  for (let i = 1; i < phones.length; i++) {
    const prev = phones[i - 1];
    if (phones[i].t < prev.t + 0.01) phones[i].t = prev.t + 0.01;
    if (prev.t + prev.d > phones[i].t) prev.d = phones[i].t - prev.t;
  }
  const last = notes[notes.length - 1];
  return {
    phones,
    pitch,
    vibrato: [{ t: 0, v: vibrato }],
    words: captions,
    length: last ? last.t + last.d + 0.3 : 0,
  };
}
