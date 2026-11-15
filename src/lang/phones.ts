/**
 * The language layer's own vocabulary, below the Score: a sound with its length mark, a syllable
 * (onset, nucleus, coda), a word made of syllables, and the classes of sound the timing rules
 * ask about. Every front end (English, Spanish, ...) produces words in this shape; speech and
 * singing only ever read this shape.
 */
import { PHONES, type PhoneSymbol } from "../contract.ts";

/** One sound inside a word. `long` is a length mark: a long vowel, or a doubled consonant. */
export interface Seg {
  ph: PhoneSymbol;
  long?: boolean;
  /** a vowel said so lightly it is almost whispered away (Japanese desu): speech shortens it */
  faint?: boolean;
}

/**
 * One syllable. The nucleus is one vowel, or two for a diphthong (the second is where it glides
 * to), or a syllabic nasal (Japanese ん). Consonants before it are the onset, after it the coda.
 */
export interface Syl {
  onset: Seg[];
  nucleus: Seg[];
  coda: Seg[];
  /** 0 unstressed, 1 primary, 2 secondary */
  stress: 0 | 1 | 2;
  /** Japanese: this mora only lengthens the vowel before it (the second half of a long vowel). */
  lengthens?: boolean;
}

/** One word: the text as written and how it is said. */
export interface WordPron {
  text: string;
  syls: Syl[];
  /** a function word (the, of, a): never accented, said quickly */
  func?: boolean;
}

/** A pause the text asks for, from the weakest to the strongest. */
export type Break = "comma" | "colon" | "stop" | "question" | "exclaim" | "paragraph";

export type Token = { kind: "word"; word: WordPron } | { kind: "break"; type: Break };

const SET = new Set<string>(PHONES);
export const isPhone = (s: string): s is PhoneSymbol => SET.has(s);

export const VOWELS = new Set<PhoneSymbol>(["i", "y", "ɨ", "ɯ", "u", "ɪ", "ʊ", "e", "ø", "o", "ə", "ɛ", "œ", "ɜ", "ʌ", "ɔ", "æ", "a", "ɑ", "ɒ", "ɚ"]);
export const STOPS = new Set<PhoneSymbol>(["p", "b", "t", "d", "k", "g", "ʔ"]);
export const NASALS = new Set<PhoneSymbol>(["m", "n", "ɲ", "ŋ"]);
export const FRICATIVES = new Set<PhoneSymbol>(["ɸ", "β", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "ɕ", "ç", "x", "ɣ", "h"]);
export const AFFRICATES = new Set<PhoneSymbol>(["tʃ", "dʒ", "ts", "dz"]);
export const LIQUIDS = new Set<PhoneSymbol>(["l", "ʎ", "ɹ", "r", "ɾ"]);
export const GLIDES = new Set<PhoneSymbol>(["j", "w"]);
export const VOICELESS = new Set<PhoneSymbol>(["p", "t", "k", "ʔ", "ɸ", "f", "θ", "s", "ʃ", "ɕ", "ç", "x", "h", "tʃ", "ts"]);

export const isVowel = (p: PhoneSymbol): boolean => VOWELS.has(p);
/** sounds with a closure: their slot starts with silence */
export const isClosure = (p: PhoneSymbol): boolean => STOPS.has(p) || AFFRICATES.has(p);

/** Every sound of a syllable in order. */
export const sylSegs = (s: Syl): Seg[] => [...s.onset, ...s.nucleus, ...s.coda];

/**
 * Cut a run of sounds into syllables. Vowels (and anything `nucleus` accepts) are the nuclei;
 * a vowel right after a one-vowel nucleus joins it when `diphthong(i)` says segs[i] is where
 * that nucleus glides to. The consonants between two nuclei go to the second syllable as far
 * as `onset` allows (the maximal-onset principle), the rest close the first. Consonants before
 * the first nucleus are its onset, after the last its coda. A word with no nucleus at all
 * becomes one syllable with an empty nucleus.
 */
export function syllabify(
  segs: Seg[],
  onset: (cluster: PhoneSymbol[]) => boolean,
  diphthong: (i: number) => boolean = () => false,
  nucleus: (s: Seg) => boolean = (s) => isVowel(s.ph),
): Syl[] {
  // runs: [start, end) of each nucleus
  const nuclei: [number, number][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (!nucleus(segs[i])) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && last[1] === i && last[1] - last[0] === 1 && diphthong(i)) last[1] = i + 1;
    else nuclei.push([i, i + 1]);
  }
  if (nuclei.length === 0) return [{ onset: segs.filter((s) => !nucleus(s)), nucleus: [], coda: [], stress: 0 }];
  const syls: Syl[] = nuclei.map(([a, b]) => ({ onset: [], nucleus: segs.slice(a, b), coda: [], stress: 0 }));
  syls[0].onset = segs.slice(0, nuclei[0][0]);
  syls[syls.length - 1].coda = segs.slice(nuclei[nuclei.length - 1][1]);
  for (let k = 0; k + 1 < nuclei.length; k++) {
    const between = segs.slice(nuclei[k][1], nuclei[k + 1][0]);
    let split = between.length;
    // the longest tail of the cluster that can start a syllable
    for (let s = 0; s <= between.length; s++) {
      const tail = between.slice(s);
      if (tail.length === 0 || onset(tail.map((x) => x.ph))) {
        split = s;
        break;
      }
    }
    // a doubled consonant is split between the syllables in speech; for singing it waits for the
    // next vowel, so it stays whole in the onset (its length mark carries the doubling)
    syls[k].coda = between.slice(0, split);
    syls[k + 1].onset = between.slice(split);
  }
  return syls;
}

/**
 * The onsets of Spanish, Italian and Latin: one consonant; a stop or f (or their soft forms)
 * before l or r; and either of those followed by a glide (j, w).
 */
export function plainOnset(cluster: PhoneSymbol[]): boolean {
  const glideAfter = cluster.length > 1 && GLIDES.has(cluster[cluster.length - 1]);
  const core = glideAfter ? cluster.slice(0, -1) : cluster;
  if (core.length === 0) return true;
  if (core.length === 1) return !GLIDES.has(core[0]) || !glideAfter;
  if (core.length === 2) {
    const [a, b] = core;
    const obstruent = STOPS.has(a) || a === "f" || a === "v" || a === "ɸ" || a === "β" || a === "ð" || a === "ɣ" || a === "x";
    return obstruent && (b === "l" || b === "ɾ" || b === "r" || b === "ɹ");
  }
  return false;
}
