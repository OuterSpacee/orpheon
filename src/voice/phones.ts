// What the body does for each sound in PHONES.
//
// A vowel is a whole pose of the tongue, jaw and lips, fitted to measurements
// (vowels.generated.ts). A consonant is a gesture laid over the vowels around it: it names the
// part that makes its closure or gap and the few pose values it insists on, and leaves the rest
// to the vowels (Öhman 1966). The places and manners are the standard ones of the IPA chart; the
// gap areas of fricatives follow Stevens (1998, ch. 8): around a tenth of a square centimetre.
import { PHONES } from "../contract.ts";
import type { Body, PhoneSymbol, Pose } from "../contract.ts";
import { FITTED_KEYS, FITTED_TRACTS, FITTED_VOWELS } from "./vowels.generated.ts";

export type Manner =
  | "vowel"
  | "stop"
  | "nasal"
  | "fricative"
  | "affricate"
  /** A narrowing too wide to hiss: j, w, ɹ. */
  | "approximant"
  /** The tip sealed with air passing its sides: l, ʎ. */
  | "lateral"
  | "trill"
  | "tap"
  /** h: only the folds held apart. */
  | "breath"
  /** ʔ: only the folds squeezed shut. */
  | "catch"
  | "rest";

/** The part of the mouth that makes a consonant's closure or gap, as its pose key. */
export type Maker = "lips" | "tip" | "tongueY";

export interface Sound {
  manner: Manner;
  voiced: boolean;
  /** What closes or narrows. */
  maker?: Maker;
  /** How wide the narrowest place is, cm² for the reference man. Stops and nasals have none: they seal. */
  gap?: number;
  /** The other pose values the sound insists on while it lasts. */
  set: Partial<Pose>;
  /** An affricate lets go into this fricative. */
  into?: PhoneSymbol;
  /** Velars slide along the roof toward the vowel beside them (the k of "key" against "coo"). */
  slides?: boolean;
}

/** Aiming a part "through" the far side of a seal shuts it fast and holds it firmly. */
export const SHUT: Record<Maker, number> = { lips: -0.3, tip: 1.3, tongueY: 1.2 };
/** The pose value at which each part just seals (see shape.ts). */
export const SEALED: Record<Maker, number> = { lips: 0.08, tip: 0.8, tongueY: 0.893 };

const VELAR = 0.62;
const PALATAL = 0.88;
/** The tongue and lips of sh: tip behind the ridge, body bunched up behind it, lips pushed out. */
const HUSH: Partial<Pose> = { tipX: 0.8, jaw: 0.1, round: 0.45, lips: 0.5, tongueX: 0.8, tongueY: 0.5 };

const CONSONANTS: Partial<Record<PhoneSymbol, Sound>> = {
  p: { manner: "stop", voiced: false, maker: "lips", set: { jaw: 0.2 } },
  b: { manner: "stop", voiced: true, maker: "lips", set: { jaw: 0.2 } },
  t: { manner: "stop", voiced: false, maker: "tip", set: { tipX: 0.5, jaw: 0.15 } },
  d: { manner: "stop", voiced: true, maker: "tip", set: { tipX: 0.5, jaw: 0.15 } },
  k: { manner: "stop", voiced: false, maker: "tongueY", set: { tongueX: VELAR, jaw: 0.3 }, slides: true },
  g: { manner: "stop", voiced: true, maker: "tongueY", set: { tongueX: VELAR, jaw: 0.3 }, slides: true },
  ʔ: { manner: "catch", voiced: false, set: {} },

  m: { manner: "nasal", voiced: true, maker: "lips", set: { jaw: 0.2 } },
  n: { manner: "nasal", voiced: true, maker: "tip", set: { tipX: 0.5, jaw: 0.15 } },
  ɲ: { manner: "nasal", voiced: true, maker: "tongueY", set: { tongueX: PALATAL, jaw: 0.2 } },
  ŋ: { manner: "nasal", voiced: true, maker: "tongueY", set: { tongueX: VELAR, jaw: 0.3 }, slides: true },

  ɸ: { manner: "fricative", voiced: false, maker: "lips", gap: 0.12, set: { round: 0.4, jaw: 0.15 } },
  β: { manner: "fricative", voiced: true, maker: "lips", gap: 0.15, set: { round: 0.4, jaw: 0.15 } },
  f: { manner: "fricative", voiced: false, maker: "lips", gap: 0.1, set: { round: 0, jaw: 0.1 } },
  v: { manner: "fricative", voiced: true, maker: "lips", gap: 0.1, set: { round: 0, jaw: 0.1 } },
  θ: { manner: "fricative", voiced: false, maker: "tip", gap: 0.2, set: { tipX: 0, jaw: 0.15 } },
  ð: { manner: "fricative", voiced: true, maker: "tip", gap: 0.16, set: { tipX: 0, jaw: 0.15 } },
  s: { manner: "fricative", voiced: false, maker: "tip", gap: 0.1, set: { tipX: 0.5, jaw: 0.08 } },
  z: { manner: "fricative", voiced: true, maker: "tip", gap: 0.12, set: { tipX: 0.5, jaw: 0.08 } },
  ʃ: { manner: "fricative", voiced: false, maker: "tip", gap: 0.15, set: HUSH },
  ʒ: { manner: "fricative", voiced: true, maker: "tip", gap: 0.17, set: HUSH },
  ɕ: { manner: "fricative", voiced: false, maker: "tongueY", gap: 0.13, set: { tongueX: 0.97, jaw: 0.1, round: 0, lips: 0.5 } },
  ç: { manner: "fricative", voiced: false, maker: "tongueY", gap: 0.15, set: { tongueX: PALATAL, jaw: 0.15 } },
  x: { manner: "fricative", voiced: false, maker: "tongueY", gap: 0.15, set: { tongueX: VELAR, jaw: 0.3 }, slides: true },
  ɣ: { manner: "fricative", voiced: true, maker: "tongueY", gap: 0.18, set: { tongueX: VELAR, jaw: 0.3 }, slides: true },
  h: { manner: "breath", voiced: false, set: {} },

  tʃ: { manner: "affricate", voiced: false, maker: "tip", set: HUSH, into: "ʃ" },
  dʒ: { manner: "affricate", voiced: true, maker: "tip", set: HUSH, into: "ʒ" },
  ts: { manner: "affricate", voiced: false, maker: "tip", set: { tipX: 0.5, jaw: 0.08 }, into: "s" },
  dz: { manner: "affricate", voiced: true, maker: "tip", set: { tipX: 0.5, jaw: 0.08 }, into: "z" },

  l: { manner: "lateral", voiced: true, maker: "tip", set: { tipX: 0.5, lateral: 1, jaw: 0.25 } },
  ʎ: { manner: "lateral", voiced: true, maker: "tip", set: { tipX: 1, lateral: 1, tongueX: 0.9, tongueY: 0.7, jaw: 0.2 } },
  // ɹ takes its tongue from the fitted r-coloured vowel; see soundOf.
  ɹ: { manner: "approximant", voiced: true, set: {} },
  r: { manner: "trill", voiced: true, maker: "tip", set: { tipX: 0.5, jaw: 0.2 } },
  ɾ: { manner: "tap", voiced: true, maker: "tip", set: { tipX: 0.5, jaw: 0.2 } },
  j: { manner: "approximant", voiced: true, maker: "tongueY", gap: 0.35, set: { tongueX: 0.92, jaw: 0.2 } },
  w: { manner: "approximant", voiced: true, maker: "lips", gap: 0.22, set: { round: 1, tongueX: 0.58, tongueY: 0.72, jaw: 0.2 } },
};

const VOWEL: Sound = { manner: "vowel", voiced: true, set: {} };
const REST_SOUND: Sound = { manner: "rest", voiced: false, set: {} };

export function isVowel(ph: PhoneSymbol): boolean {
  return ph in FITTED_VOWELS;
}

/** The pose of a vowel for a body: the fitted rows blended by tract length. */
export function vowelPose(ph: PhoneSymbol, body: Body): Partial<Pose> {
  const rows = FITTED_VOWELS[ph];
  const tracts = FITTED_TRACTS;
  let hi = 1;
  while (hi < tracts.length - 1 && body.tract > tracts[hi]) hi++;
  const mix = Math.min(1, Math.max(0, (body.tract - tracts[hi - 1]) / (tracts[hi] - tracts[hi - 1])));
  const pose: Partial<Pose> = {};
  FITTED_KEYS.forEach((key, i) => (pose[key] = rows[hi - 1][i] + (rows[hi][i] - rows[hi - 1][i]) * mix));
  return pose;
}

/** How the body makes a sound. */
export function soundOf(ph: PhoneSymbol, body: Body): Sound {
  if (ph === "_") return REST_SOUND;
  if (isVowel(ph)) return VOWEL;
  if (ph === "ɹ") {
    // The r of English: the r-coloured vowel's tongue with the lips drawn further in.
    const like = vowelPose("ɚ", body);
    return { manner: "approximant", voiced: true, set: { ...like, lips: Math.max(0.3, (like.lips ?? 0.5) - 0.12), jaw: 0.3 } };
  }
  const sound = CONSONANTS[ph];
  if (!sound) throw new Error(`Orpheon has no way to say "${ph}"`);
  return sound;
}

/** Every symbol in PHONES has a target (checked when the module loads, so a gap fails at once). */
for (const ph of PHONES) if (ph !== "_" && ph !== "ɹ" && !isVowel(ph) && !CONSONANTS[ph]) throw new Error(`no target for ${ph}`);
