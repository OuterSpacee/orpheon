/**
 * English (General American): the CMU Pronouncing Dictionary first, the letter-to-sound rules
 * (en-rules.ts) for anything it does not have, and the reading of numbers, symbols, letters
 * and common abbreviations.
 */
import type { PhoneSymbol } from "../contract.ts";
import { Dictionary, unpackDictionary } from "./en-dict.ts";
import { letterToSound } from "./en-rules.ts";
import type { Language, Style } from "./language.ts";
import { type Seg, type Syl, type WordPron, syllabify } from "./phones.ts";
import { type Piece, splitNumber } from "./text.ts";

let dictionary: Dictionary | null = null;

/** Hand the packed dictionary over (the text of public/lang/en-dict.txt). */
export function loadEnglish(packed: string): void {
  dictionary = new Dictionary(unpackDictionary(packed));
}
export const englishLoaded = (): boolean => dictionary !== null;

/** ARPAbet vowels: their sounds in the inventory (diphthongs split in two) */
const VOWEL: Record<string, PhoneSymbol[]> = {
  AA: ["ɑ"], AE: ["æ"], AH: ["ʌ"], AO: ["ɔ"], AW: ["a", "ʊ"], AY: ["a", "ɪ"], EH: ["ɛ"], ER: ["ɚ"],
  EY: ["e", "ɪ"], IH: ["ɪ"], IY: ["i"], OW: ["o", "ʊ"], OY: ["ɔ", "ɪ"], UH: ["ʊ"], UW: ["u"],
};
const CONSONANT: Record<string, PhoneSymbol> = {
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "g", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n",
  NG: "ŋ", P: "p", R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

/** Two- and three-consonant clusters English starts a syllable with. */
const ONSETS = new Set([
  "pɹ", "bɹ", "tɹ", "dɹ", "kɹ", "gɹ", "fɹ", "θɹ", "ʃɹ", "pl", "bl", "kl", "gl", "fl", "sl",
  "tw", "dw", "kw", "gw", "sw", "θw", "sp", "st", "sk", "sm", "sn", "sf",
  "pj", "bj", "kj", "fj", "vj", "mj", "hj", "spɹ", "stɹ", "skɹ", "spl", "skw", "skj", "spj",
]);
const englishOnset = (c: PhoneSymbol[]): boolean => (c.length === 1 ? c[0] !== "ŋ" : ONSETS.has(c.join("")));

/** ARPAbet with stress digits → syllables. */
export function arpaToSyllables(arpa: string[]): Syl[] {
  const segs: Seg[] = [];
  const stress: number[] = [];
  /** index of each seg that continues the vowel before it */
  const glide = new Set<number>();
  for (const p of arpa) {
    const base = p.replace(/\d$/, "");
    const v = VOWEL[base];
    if (v) {
      const digit = Number(p.slice(-1)) || 0;
      // AH unstressed is the schwa; stressed it is the vowel of "cup"
      const sounds: PhoneSymbol[] = base === "AH" && digit === 0 ? ["ə"] : v;
      sounds.forEach((ph, k) => {
        if (k > 0) glide.add(segs.length);
        segs.push({ ph });
      });
      stress.push(digit);
    } else if (CONSONANT[base]) segs.push({ ph: CONSONANT[base] });
  }
  const syls = syllabify(segs, englishOnset, (i) => glide.has(i));
  syls.forEach((s, k) => (s.stress = (stress[k] ?? 0) as 0 | 1 | 2));
  return syls;
}

/** Function words: never accented in speech, and said in their weak form. */
const WEAK: Record<string, string> = {
  a: "AH0", an: "AH0 N", the: "DH AH0", and: "AH0 N D", or: "ER0", but: "B AH0 T", of: "AH0 V", to: "T AH0",
  for: "F ER0", from: "F R AH0 M", at: "AH0 T", as: "AH0 Z", than: "DH AH0 N", can: "K AH0 N", was: "W AH0 Z",
  were: "W ER0", are: "ER0", am: "AH0 M", is: "IH0 Z", be: "B IY0", been: "B IH0 N", has: "HH AH0 Z", have: "HH AH0 V",
  had: "HH AH0 D", do: "D UW0", does: "D AH0 Z", them: "DH AH0 M", her: "HH ER0", his: "HH IH0 Z", your: "Y ER0",
  you: "Y UW0", he: "HH IY0", she: "SH IY0", we: "W IY0", they: "DH EY0", it: "IH0 T", its: "IH0 T S", my: "M AY0",
  me: "M IY0", us: "AH0 S", him: "HH IH0 M", our: "AW0 ER0", their: "DH EH0 R", some: "S AH0 M", that: "DH AH0 T",
  in: "IH0 N", on: "AA0 N", by: "B AY0", with: "W IH0 DH", so: "S OW0", if: "IH0 F", not: "N AA0 T", will: "W IH0 L",
  would: "W UH0 D", should: "SH UH0 D", could: "K UH0 D", shall: "SH AH0 L", into: "IH0 N T UW0", upon: "AH0 P AA0 N",
  i: "AY0", there: "DH ER0", who: "HH UW0", which: "W IH0 CH",
};

const LETTERS: Record<string, string> = {
  a: "EY1", b: "B IY1", c: "S IY1", d: "D IY1", e: "IY1", f: "EH1 F", g: "JH IY1", h: "EY1 CH", i: "AY1",
  j: "JH EY1", k: "K EY1", l: "EH1 L", m: "EH1 M", n: "EH1 N", o: "OW1", p: "P IY1", q: "K Y UW1", r: "AA1 R",
  s: "EH1 S", t: "T IY1", u: "Y UW1", v: "V IY1", w: "D AH1 B AH0 L Y UW0", x: "EH1 K S", y: "W AY1", z: "Z IY1",
};

const ABBREVIATIONS: Record<string, string> = {
  "mr.": "mister", "mrs.": "missus", "ms.": "miz", "dr.": "doctor", "prof.": "professor", "st.": "saint",
  "jr.": "junior", "sr.": "senior", "vs.": "versus", "etc.": "et cetera", "e.g.": "for example", "i.e.": "that is",
  "mt.": "mount", "ave.": "avenue", "inc.": "incorporated", "ltd.": "limited", "co.": "company", "no.": "number",
  "jan.": "january", "feb.": "february", "mar.": "march", "apr.": "april", "aug.": "august", "sept.": "september",
  "sep.": "september", "oct.": "october", "nov.": "november", "dec.": "december", "approx.": "approximately",
  "dept.": "department", "est.": "established", "fig.": "figure", "min.": "minutes", "hr.": "hour", "sec.": "seconds",
};
/** abbreviations written without a stop */
const BARE: Record<string, string> = {
  km: "kilometers", kg: "kilograms", cm: "centimeters", mm: "millimeters", ml: "milliliters", mph: "miles per hour",
  lb: "pounds", lbs: "pounds", oz: "ounces", ft: "feet", hz: "hertz", khz: "kilohertz", ok: "okay", tv: "tee vee",
};

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function below1000(n: number): string[] {
  const out: string[] = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], "hundred");
    n %= 100;
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)]);
    if (n % 10) out.push(ONES[n % 10]);
  } else if (n > 0 || out.length === 0) out.push(ONES[n]);
  return out;
}

/** A whole number written out: 1234 → one thousand two hundred thirty four. */
export function englishNumber(digits: string): string[] {
  const s = digits.replace(/^0+(?=\d)/, "");
  if (s.length > 15) return [...digits].map((d) => ONES[Number(d)]);
  let n = Number(s);
  if (n === 0) return ["zero"];
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const out: string[] = [];
  for (let g = groups.length - 1; g >= 0; g--) if (groups[g]) out.push(...below1000(groups[g]), ...(SCALES[g] ? [SCALES[g]] : []));
  return out;
}

/** A year as people say it: 1999 → nineteen ninety nine, 2005 → two thousand five. */
function year(n: number): string[] {
  if (n >= 2000 && n < 2010) return englishNumber(String(n));
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return [...englishNumber(String(hi)), "hundred"];
  return [...englishNumber(String(hi)), ...(lo < 10 ? ["oh"] : []), ...englishNumber(String(lo))];
}

const ORDINAL: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinal(words: string[]): string[] {
  const last = words[words.length - 1];
  const o = ORDINAL[last] ?? (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th");
  return [...words.slice(0, -1), o];
}

const CURRENCY: Record<string, [string, string]> = { $: ["dollar", "dollars"], "£": ["pound", "pounds"], "€": ["euro", "euros"], "¥": ["yen", "yen"] };
const SYMBOL_WORDS: Record<string, string> = { "%": "percent", "&": "and", "+": "plus", "=": "equals", "@": "at", "°": "degrees", "#": "number", "×": "times", "/": "slash" };

function expandNumber(p: Piece & { kind: "number" }, prev: Piece | undefined, before: Piece | undefined): string[] {
  const { whole, frac } = splitNumber(p.text);
  const negative = prev?.kind === "symbol" && prev.text === "-" && before?.kind !== "number";
  let words: string[];
  const n = Number(whole);
  if (p.ordinal) words = ordinal(englishNumber(whole));
  else if (!frac && whole.length === 4 && n >= 1100 && n < 2100 && !p.text.includes(",")) words = year(n);
  else words = englishNumber(whole);
  if (frac) words.push("point", ...[...frac].map((d) => ONES[Number(d)]));
  return negative ? ["minus", ...words] : words;
}

/** a word spelt letter by letter */
function spell(text: string): WordPron {
  const syls = [...text.toLowerCase()].flatMap((c) => (LETTERS[c] ? arpaToSyllables(LETTERS[c].split(" ")) : []));
  // the last letter carries the stress, the rest a lighter one
  syls.forEach((s) => s.stress = s.stress ? 2 : 0);
  const last = [...syls].reverse().find((s) => s.stress);
  if (last) last.stress = 1;
  return { text, syls };
}

/** American flap: t or d between vowels, before an unstressed one (water, city, ladder). */
function flap(syls: Syl[]): void {
  for (let k = 1; k < syls.length; k++) {
    const s = syls[k];
    const before = syls[k - 1];
    const vowelBefore = before.coda.length === 0 || (before.coda.length === 1 && before.coda[0].ph === "ɹ");
    if (s.stress === 0 && vowelBefore && s.onset.length === 1 && (s.onset[0].ph === "t" || s.onset[0].ph === "d") && s.nucleus.length) s.onset = [{ ph: "ɾ" }];
  }
}

export function englishPronunciation(word: string): string[] {
  const w = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^'+|'+$/g, "");
  return dictionary?.lookup(w) ?? letterToSound(w);
}

export const english: Language = {
  abbreviation: (w) => (w.toLowerCase() + ".") in ABBREVIATIONS || /^([a-z]\.)+[a-z]$/i.test(w),

  expand(pieces) {
    const out: ReturnType<Language["expand"]> = [];
    let currency: [string, string] | null = null;
    pieces.forEach((p, i) => {
      const prev = pieces[i - 1];
      if (p.kind === "break") out.push({ brk: p.type });
      else if (p.kind === "number") {
        const words = expandNumber(p, prev, pieces[i - 2]);
        out.push(...words.map((word) => ({ word })));
        if (currency) {
          out.push({ word: words.join(" ") === "one" ? currency[0] : currency[1] });
          currency = null;
        }
      } else if (p.kind === "symbol") {
        const next = pieces[i + 1];
        if (CURRENCY[p.text] && next?.kind === "number") currency = CURRENCY[p.text];
        else if (p.text === "-" && next?.kind === "number") {
          // 5-10 is "five to ten"; a minus sign before a lone number is read with the number
          if (prev?.kind === "number") out.push({ word: "to" });
        }
        else if (SYMBOL_WORDS[p.text]) out.push({ word: SYMBOL_WORDS[p.text] });
      } else {
        const lower = p.text.toLowerCase();
        const abbr = ABBREVIATIONS[lower];
        if (abbr) out.push(...abbr.split(" ").map((word) => ({ word })));
        else if (/^([a-z]\.)+[a-z]\.?$/i.test(p.text)) out.push({ word: p.text.replace(/\./g, ""), spell: true });
        else if (BARE[lower] && prev?.kind === "number") out.push(...BARE[lower].split(" ").map((word) => ({ word })));
        else out.push({ word: p.text });
      }
    });
    return out;
  },

  word(text: string, style: Style, spellIt?: boolean): WordPron {
    const lower = text.toLowerCase();
    const caps = /^[A-Z]{2,5}s?$/.test(text) && !/^[A-Z][a-z]/.test(text);
    if (spellIt || (caps && !dictionary?.lookup(lower))) return spell(text);
    if (/^[a-z]$/i.test(text) && lower !== "a" && lower !== "i") return spell(text);
    const func = lower in WEAK;
    const arpa = style === "speech" && func ? WEAK[lower].split(" ") : englishPronunciation(text);
    const syls = arpaToSyllables(arpa);
    if (style === "speech") flap(syls);
    if (func) for (const s of syls) s.stress = 0;
    return { text, syls, func };
  },

  adjust(tokens) {
    // "the" before a vowel is "thee"
    for (let i = 0; i + 1 < tokens.length; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (a.kind !== "word" || b.kind !== "word" || a.word.text.toLowerCase() !== "the") continue;
      const first = b.word.syls[0];
      if (first && first.onset.length === 0 && first.nucleus.length) a.word.syls[0].nucleus = [{ ph: "i" }];
    }
  },
};
