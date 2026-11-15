/**
 * How long each sound lasts. Speech follows the shape of Klatt's duration rules (D. H. Klatt,
 * "Synthesis by rule of segmental durations in English sentences", in Frontiers of Speech
 * Communication Research, 1979): every sound has an inherent length and a shortest length, and
 * the rules scale the part above the shortest, D = Dmin + (Dinh - Dmin) * k. The numbers below
 * are our own, read off what speech sounds like, not copied from the paper.
 */
import type { PhoneSymbol } from "../contract.ts";

/** [inherent, shortest] in milliseconds, for speech */
export const SPEECH_MS: Record<PhoneSymbol, [number, number]> = {
  i: [150, 60], y: [150, 60], ɨ: [140, 55], ɯ: [140, 55], u: [160, 60], ɪ: [120, 45], ʊ: [120, 45],
  e: [150, 60], ø: [150, 60], o: [160, 65], ə: [100, 35], ɛ: [140, 55], œ: [140, 55], ɜ: [170, 70],
  ʌ: [130, 50], ɔ: [190, 80], æ: [210, 80], a: [190, 75], ɑ: [210, 80], ɒ: [190, 75], ɚ: [170, 60],
  p: [85, 50], b: [70, 45], t: [75, 45], d: [65, 40], k: [85, 55], g: [70, 45], ʔ: [50, 30],
  m: [70, 45], n: [60, 35], ɲ: [75, 45], ŋ: [80, 50],
  ɸ: [90, 55], β: [50, 30], f: [100, 70], v: [60, 40], θ: [90, 60], ð: [45, 30], s: [105, 60], z: [75, 40],
  ʃ: [105, 70], ʒ: [70, 40], ɕ: [100, 60], ç: [90, 55], x: [90, 55], ɣ: [50, 30], h: [70, 40],
  tʃ: [110, 70], dʒ: [95, 55], ts: [100, 60], dz: [90, 50],
  l: [70, 40], ʎ: [75, 45], ɹ: [70, 30], r: [80, 50], ɾ: [25, 20], j: [60, 35], w: [65, 35],
  _: [200, 100],
};

/**
 * Seconds a consonant takes in song: shorter than in speech and nearly the same in every
 * syllable, since the vowel carries the note. A doubled consonant takes more.
 */
export function sungConsonant(p: PhoneSymbol, long = false): number {
  let d: number;
  if (p === "ɾ") d = 0.03;
  else if (p === "p" || p === "t" || p === "k") d = 0.065;
  else if (p === "b" || p === "d" || p === "g" || p === "ʔ") d = 0.055;
  else if (p === "s" || p === "ʃ" || p === "ɕ" || p === "f" || p === "θ" || p === "x" || p === "ç" || p === "ɸ") d = 0.085;
  else if (p === "tʃ" || p === "ts" || p === "dʒ" || p === "dz") d = 0.09;
  else if (p === "z" || p === "ʒ" || p === "v" || p === "ð" || p === "β" || p === "ɣ" || p === "h") d = 0.065;
  else if (p === "m" || p === "n" || p === "ɲ" || p === "ŋ") d = 0.07;
  else if (p === "j" || p === "w") d = 0.05;
  else if (p === "l" || p === "ʎ" || p === "ɹ" || p === "r") d = 0.06;
  // a vowel among consonants (the tail of two syllables sung on one note)
  else d = 0.08;
  return long ? d * 1.6 : d;
}
