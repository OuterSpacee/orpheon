/**
 * What Spanish, Italian and church Latin share once their spelling has been read into sounds:
 * which of i and u are glides, how the sounds fall into syllables, and where the stress goes.
 */
import type { PhoneSymbol } from "../contract.ts";
import { type Seg, type Syl, isVowel, syllabify } from "./phones.ts";

/** A sound read from the spelling, with what the spelling said about it. */
export interface Letter extends Seg {
  /** a vowel written with an accent mark: it carries the stress, and is never a glide */
  accent?: boolean;
  /** i or u without an accent: may glide into a vowel beside it */
  weak?: boolean;
}

const GLIDE_OF: Partial<Record<PhoneSymbol, PhoneSymbol>> = { i: "j", u: "w" };

/**
 * Weak vowels before another vowel become glides (tiene → tje-ne); after one, they stay vowels
 * and close a falling diphthong (aire → ai-re). Of two weak vowels together the first glides
 * (ciudad → sju-dad).
 */
export function resolveGlides(letters: Letter[]): Letter[] {
  const out = letters.map((l) => ({ ...l }));
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    if (out[i].weak && next && isVowel(next.ph)) out[i] = { ph: GLIDE_OF[out[i].ph]!, long: out[i].long };
  }
  return out;
}

/**
 * Syllables from sounds. A weak vowel right after a vowel closes its diphthong. `stress`
 * returns the index of the stressed syllable, given the syllables and whether any was marked.
 */
export function romanceSyllables(letters: Letter[], onset: (c: PhoneSymbol[]) => boolean, stress: (syls: Syl[], marked: number) => number): Syl[] {
  const segs = resolveGlides(letters);
  const syls = syllabify(segs, onset, (i) => !!segs[i].weak && isVowel(segs[i - 1].ph) && !segs[i - 1].weak);
  const marked = syls.findIndex((s) => s.nucleus.some((seg) => (seg as Letter).accent));
  const at = syls.length === 1 ? 0 : stress(syls, marked);
  if (at >= 0 && at < syls.length) syls[at].stress = 1;
  // the flags were for the rules here; the syllables keep plain sounds
  for (const s of syls) for (const part of [s.onset, s.nucleus, s.coda]) part.forEach((seg, i) => (part[i] = seg.long ? { ph: seg.ph, long: true } : { ph: seg.ph }));
  return syls;
}

/** onsets for Italian and Latin, where s before a consonant begins the next syllable (pa-sta) */
export function sOnset(plain: (c: PhoneSymbol[]) => boolean): (c: PhoneSymbol[]) => boolean {
  return (c) => plain(c) || (c.length >= 2 && (c[0] === "s" || c[0] === "z") && plain(c.slice(1)) && !isVowel(c[1]));
}
