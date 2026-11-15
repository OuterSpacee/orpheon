/**
 * Text already written in IPA. Spaces part words; ˈ and ˌ mark the stressed syllable that
 * follows; a dot inside a word parts syllables (at the end of a word it is a full stop); ː
 * lengthens; | and ‖ are a minor and a major pause, as are , ; ? and !. Diacritics and tie bars
 * are dropped, and a symbol the voice has no form for becomes the nearest one it has.
 * Where no syllable marks are given, the sounds are parted by the maximal-onset rule with
 * the onsets most languages allow.
 */
import type { PhoneSymbol } from "../contract.ts";
import type { Language, Said } from "./language.ts";
import { type Seg, type Syl, isPhone, isVowel, plainOnset, syllabify, type WordPron } from "./phones.ts";
import type { Piece } from "./text.ts";

/** IPA symbols outside the inventory, and the sound the voice makes for each */
const NEAREST: Record<string, string> = {
  ɐ: "ə", ɘ: "ə", ɵ: "ø", ɤ: "ɯ", ʉ: "u", ɞ: "œ", ɶ: "œ", ä: "a", ɝ: "ɚ", ᵻ: "ɨ", ᵿ: "ʊ", ʏ: "y", ɷ: "ʊ",
  ɫ: "l", ɭ: "l", ʟ: "l", ɬ: "l", ɮ: "l", ɺ: "ɾ", ɽ: "ɾ", ɻ: "ɹ", ʀ: "r", ʁ: "ɣ", χ: "x", ħ: "h", ʕ: "h",
  ɦ: "h", ʋ: "v", ɱ: "m", ɳ: "n", ɴ: "ŋ", ɰ: "w", ʍ: "w", ɥ: "j", ʝ: "j", c: "k", ɟ: "g", q: "k", ɢ: "g",
  ʂ: "ʃ", ʐ: "ʒ", ʑ: "ʒ", ɧ: "ʃ", ɡ: "g", ʈ: "t", ɖ: "d", ʧ: "tʃ", ʤ: "dʒ", ʦ: "ts", ʣ: "dz",
  ʜ: "h", ʡ: "ʔ", ɓ: "b", ɗ: "d", ʄ: "j", ɠ: "g", ʛ: "g", ʘ: "p", ǀ: "t", ǃ: "k", ǂ: "t", ǁ: "l",
};
/** pairs that are one sound */
const PAIRS: Record<string, PhoneSymbol> = { tʃ: "tʃ", dʒ: "dʒ", ts: "ts", dz: "dz", tɕ: "tʃ", dʑ: "dʒ", tʂ: "tʃ", dʐ: "dʒ" };

/** a symbol in the inventory, or its nearest; null for anything that is not a sound */
function sound(s: string): PhoneSymbol | null {
  if (isPhone(s)) return s;
  const n = NEAREST[s];
  if (n && isPhone(n)) return n;
  return null;
}

/** Second vowels that make a falling diphthong with the vowel before them (aɪ, aʊ, eɪ, ɔɪ, oʊ, ɪə). */
const OFFGLIDES = new Set<PhoneSymbol>(["ɪ", "ʊ", "ə", "ɐ" as PhoneSymbol, "i", "u", "ɚ"]);

interface Mark {
  seg: Seg;
  /** a syllable boundary or stress mark came just before this sound */
  boundary?: 0 | 1 | 2 | 3;
  /** joined to the vowel before it as a diphthong (a non-syllabic mark or a tie) */
  glide?: boolean;
}

/** One IPA word to syllables. */
export function ipaWord(text: string): WordPron {
  // a precomposed symbol the inventory lacks (ã, é) is read as its base letter and its marks;
  // one it has (ç) stays whole
  const chars = [...text.normalize("NFC")].flatMap((c) => (sound(c) ? [c] : [...c.normalize("NFD")]));
  const marks: Mark[] = [];
  /** 1 primary, 2 secondary, 3 a dot, 0 none: what the next sound starts */
  let pending: 0 | 1 | 2 | 3 = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "ˈ" || c === "'") pending = 1;
    else if (c === "ˌ") pending = 2;
    else if (c === "." || c === "-") pending = pending || 3;
    else if (c === "ː" || c === ":" || c === "ˑ") {
      const last = marks[marks.length - 1];
      if (last) last.seg.long = true;
    } else if (c === "̯" || c === "͡" || c === "͜") {
      // non-syllabic (a̯) marks the last sound as a glide; a tie joins two symbols
      if (c === "̯") {
        const last = marks[marks.length - 1];
        if (last) last.glide = true;
      }
    } else if (/\p{M}/u.test(c) || /[ʰʷʲˠˤ̃ⁿˡ]/.test(c)) {
      // other diacritics change a sound's color, not which sound it is
    } else {
      // two-symbol sounds (an affricate), with or without a tie between
      const next = chars[i + 1] === "͡" || chars[i + 1] === "͜" ? chars[i + 2] : chars[i + 1];
      const pair = next ? PAIRS[c + next] : undefined;
      if (pair) {
        i += chars[i + 1] === next ? 1 : 2;
        marks.push({ seg: { ph: pair }, boundary: pending || undefined });
        pending = 0;
        continue;
      }
      const ph = sound(c);
      if (!ph) continue;
      marks.push({ seg: { ph }, boundary: pending || undefined });
      pending = 0;
    }
  }
  const segs = marks.map((m) => m.seg);
  const explicit = marks.some((m) => m.boundary);
  let syls: Syl[];
  if (explicit) {
    // cut where the text marks a boundary; the stress mark says the stress of what follows
    syls = [];
    let start = 0;
    const stressOf: (0 | 1 | 2)[] = [];
    const parts: Mark[][] = [];
    marks.forEach((m, i) => {
      if (m.boundary && i > start) {
        parts.push(marks.slice(start, i));
        start = i;
      }
    });
    parts.push(marks.slice(start));
    for (const p of parts) {
      const b = p[0]?.boundary;
      stressOf.push(b === 1 ? 1 : b === 2 ? 2 : 0);
      // a part with two vowel groups was not marked between them: cut it further
      const sub = syllabify(p.map((m) => m.seg), plainOnset, (k) => diphthong(p, k));
      sub.forEach((s, k) => {
        s.stress = k === 0 ? stressOf[stressOf.length - 1] : 0;
        syls.push(s);
      });
    }
  } else {
    syls = syllabify(segs, plainOnset, (k) => diphthong(marks, k));
  }
  // consonants alone before the first vowel group belong to it, after the last to it
  syls = syls.filter((s, k) => {
    if (s.nucleus.length || syls.length === 1) return true;
    const into = syls[k + 1] ?? syls[k - 1];
    if (into === syls[k + 1]) into.onset = [...s.onset, ...s.coda, ...into.onset];
    else into.coda = [...into.coda, ...s.onset, ...s.coda];
    return false;
  });
  if (syls.length === 1 && !syls.some((s) => s.stress)) syls[0].stress = 1;
  return { text, syls };
}

function diphthong(marks: Mark[], k: number): boolean {
  const m = marks[k];
  const prev = marks[k - 1];
  if (!prev || !isVowel(prev.seg.ph) || m.boundary) return false;
  return !!m.glide || (OFFGLIDES.has(m.seg.ph) && !prev.seg.long && prev.seg.ph !== m.seg.ph);
}

/** Pieces of IPA text: words and pauses. */
function scanIpa(text: string): Piece[] {
  const out: Piece[] = [];
  const brk = (type: "comma" | "stop" | "question" | "exclaim" | "colon") => {
    if (out.length && out[out.length - 1].kind !== "break") out.push({ kind: "break", type });
  };
  for (const raw of text.normalize("NFC").split(/\s+/)) {
    if (!raw) continue;
    let w = raw.replace(/^[[/]+|[\]/]+$/g, "");
    let after: "comma" | "stop" | "question" | "exclaim" | "colon" | null = null;
    if (/[‖]+$/.test(w)) after = "stop";
    else if (/[|]+$/.test(w)) after = "comma";
    else if (/[?]$/.test(w)) after = "question";
    else if (/[!]$/.test(w)) after = "exclaim";
    else if (/[,]$/.test(w)) after = "comma";
    else if (/[;]$/.test(w)) after = "colon";
    else if (/\.$/.test(w)) after = "stop";
    w = w.replace(/[‖|?!,;.]+$/g, "");
    if (w === "" && after) {
      brk(after);
      continue;
    }
    if (w) out.push({ kind: "word", text: w });
    if (after) brk(after);
  }
  return out;
}

export const ipa: Language = {
  scan: scanIpa,
  expand: (pieces) => pieces.flatMap((p): Said[] => (p.kind === "word" ? [{ word: p.text }] : p.kind === "break" ? [{ brk: p.type }] : [])),
  word: (text) => ipaWord(text),
};
