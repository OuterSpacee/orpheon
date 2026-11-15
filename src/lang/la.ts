/**
 * Latin as it is sung in church: the Italianate pronunciation of the Liber Usualis tradition.
 * c and g are soft before e, i, ae, oe (tʃ, dʒ), sc there is ʃ, gn is ɲ, ti before a vowel is
 * tsi, ae and oe are e, h is silent (but k in mihi and nihil), and doubled consonants are long.
 *
 * Stress: an accent mark if the text has one (church editions print them: Dóminus); else the
 * first syllable of a two-syllable word; else the next-to-last syllable when it is heavy
 * (closed, or a diphthong) or comes from an ending whose vowel is long (-amus, -are, -orum...),
 * and the one before it otherwise.
 */
import type { PhoneSymbol } from "../contract.ts";
import { expandNumbers, type Language } from "./language.ts";
import { plainOnset, type WordPron } from "./phones.ts";
import { type Letter, romanceSyllables, sOnset } from "./romance.ts";

const VOWELS: Record<string, [PhoneSymbol, boolean]> = {
  a: ["a", false], e: ["e", false], i: ["i", false], o: ["o", false], u: ["u", false], y: ["i", false],
  á: ["a", true], é: ["e", true], í: ["i", true], ó: ["o", true], ú: ["u", true], ý: ["i", true],
  æ: ["ɛ", false], œ: ["ɛ", false], ǽ: ["ɛ", true],
};
const isV = (c: string | undefined): boolean => !!c && c in VOWELS;
/** e, i, y, ae, oe: where c and g soften */
const soft = (w: string, j: number): boolean => !!w[j] && ("eiyéíýæœǽ".includes(w[j]) || ((w[j] === "a" || w[j] === "o") && w[j + 1] === "e"));
const SIMPLE: Record<string, PhoneSymbol> = { b: "b", d: "d", f: "f", l: "l", m: "m", p: "p", v: "v", k: "k" };

/** Latin words whose next-to-last vowel is long though nothing in the spelling shows it. */
const LONG_PENULT = new Set(["maria", "alleluia", "miserere", "peccata", "beata", "regina", "creator", "salvator", "dulcedo", "natura", "creatura", "laudate", "advocata", "amore", "dolore", "honore", "sanctorum", "angelorum", "deorum", "saeculorum", "nostrorum", "electorum"]);
const LONG_ENDING = /(amus|emus|imus|atis|etis|itis|are|ere|ire|ata|atus|atum|ator|atur|arum|orum|ura|onem|onis|ones|osa|osus|ivit|avit|abit|ebit)$/;

/** Church Latin spelling to sounds. `w` is lower case. */
export function latinLetters(w: string): Letter[] {
  const out: Letter[] = [];
  const push = (ph: PhoneSymbol, long = false, extra: Partial<Letter> = {}) => out.push(long ? { ph, long, ...extra } : { ph, ...extra });
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const n = w[i + 1];
    if ((c === "a" || c === "o") && n === "e") {
      // ae and oe are one vowel, open e
      push("ɛ");
      i++;
      continue;
    }
    if (c === "a" && n === "u") {
      // au is a falling diphthong (laudamus): the u closes it
      push("a");
      push("u", false, { weak: true });
      i++;
      continue;
    }
    if (c === "i" || c === "j") {
      // consonantal i: at the start before a vowel, or between vowels (Iesu, eius, alleluia)
      const consonant = c === "j" || (isV(n) && (i === 0 || isV(w[i - 1])));
      if (consonant) {
        push("j");
        continue;
      }
    }
    if (c === "u" && (w[i - 1] === "q" || (w[i - 1] === "g" && w[i - 2] === "n")) && isV(n)) {
      push("w");
      continue;
    }
    if (isV(c)) {
      const [ph, accent] = VOWELS[c];
      // i and u never glide in Latin except as above: Dei, eleison keep each vowel
      push(ph, false, { accent });
      continue;
    }
    const double = n === c;
    switch (c) {
      case "c":
        if (n === "c" && soft(w, i + 2)) {
          push("tʃ", true);
          i++;
        } else if (n === "h") {
          push("k");
          i++;
        } else if (soft(w, i + 1)) push("tʃ");
        else {
          push("k", double);
          if (double) i++;
        }
        break;
      case "g":
        if (n === "n") {
          push("ɲ", true);
          i++;
        } else if (soft(w, i + 1)) push("dʒ");
        else {
          push("g", double);
          if (double) i++;
        }
        break;
      case "s":
        if (n === "c" && soft(w, i + 2)) {
          push("ʃ");
          i++;
        } else if (double) {
          push("s", true);
          i++;
        } else push(isV(w[i - 1]) && isV(n) ? "z" : "s");
        break;
      case "t":
        if (n === "h") {
          push("t");
          i++;
        } else if (n === "i" && isV(w[i + 2]) && !"stx".includes(w[i - 1] ?? "")) push("ts");
        else {
          push("t", double);
          if (double) i++;
        }
        break;
      case "x":
        push("k");
        if (n === "c" && soft(w, i + 2)) {
          push("ʃ");
          i++;
        } else push("s");
        break;
      case "z":
        push("dz");
        break;
      case "h":
        if ((w === "mihi" || w === "nihil") && i > 0) push("k");
        break;
      case "p":
        if (n === "h") {
          push("f");
          i++;
        } else {
          push("p", double);
          if (double) i++;
        }
        break;
      case "q":
        push("k");
        break;
      case "r":
        push(double ? "r" : "ɾ", double);
        if (double) i++;
        break;
      case "n":
        push(n === "c" && !soft(w, i + 2) ? "ŋ" : n === "g" && !soft(w, i + 2) ? "ŋ" : n === "q" ? "ŋ" : "n", double);
        if (double) i++;
        break;
      case "w":
        push("v");
        break;
      default:
        if (SIMPLE[c]) {
          push(SIMPLE[c], double);
          if (double) i++;
        }
    }
  }
  return out;
}

const FUNCTION = new Set(["et", "in", "ad", "cum", "de", "ex", "e", "a", "ab", "per", "pro", "sub", "qui", "quae", "quod", "ut", "sed", "nec", "non", "est"]);

export function latinWord(text: string): WordPron {
  const w = text.toLowerCase();
  const plain = w.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const syls = romanceSyllables(latinLetters(w), sOnset(plainOnset), (syls, marked) => {
    if (marked >= 0) return marked;
    if (syls.length === 2) return 0;
    const penult = syls[syls.length - 2];
    // a doubled consonant after it closes it too (ho-san-na), though here it waits in the onset
    const heavy = penult.coda.length > 0 || !!syls[syls.length - 1].onset[0]?.long || penult.nucleus.length > 1 || penult.nucleus.some((s) => s.ph === "ɛ") || LONG_PENULT.has(plain) || LONG_ENDING.test(plain);
    return heavy ? syls.length - 2 : syls.length - 3;
  });
  const func = FUNCTION.has(w);
  if (func) for (const s of syls) s.stress = 0;
  return { text, syls, func };
}

const UNITS = ["nihil", "unus", "duo", "tres", "quattuor", "quinque", "sex", "septem", "octo", "novem", "decem", "undecim", "duodecim", "tredecim", "quattuordecim", "quindecim", "sedecim", "septendecim", "duodeviginti", "undeviginti"];
const TENS = ["", "", "viginti", "triginta", "quadraginta", "quinquaginta", "sexaginta", "septuaginta", "octoginta", "nonaginta"];
const HUNDREDS = ["", "centum", "ducenti", "trecenti", "quadringenti", "quingenti", "sescenti", "septingenti", "octingenti", "nongenti"];

export function latinNumber(digits: string): string[] {
  const n = Number(digits);
  if (!Number.isFinite(n) || n >= 4000) return [...digits].map((d) => UNITS[Number(d)]);
  const out: string[] = [];
  if (n >= 1000) out.push(...(n >= 2000 ? [UNITS[Math.floor(n / 1000)], "milia"] : ["mille"]));
  const h = Math.floor((n % 1000) / 100);
  if (h) out.push(HUNDREDS[h]);
  const r = n % 100;
  if (r >= 20) out.push(TENS[Math.floor(r / 10)], ...(r % 10 ? [UNITS[r % 10]] : []));
  else if (r > 0 || n === 0) out.push(UNITS[r]);
  return out;
}

export const latin: Language = {
  piecesReadAlone: true,
  expand: expandNumbers(
    (whole) => latinNumber(whole),
    (t) => ({ whole: t.replace(/\D.*/, ""), frac: "" }),
  ),
  word: (text) => latinWord(text),
};
