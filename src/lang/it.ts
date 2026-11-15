/**
 * Italian, read from its spelling. Written accents mark the stress and the open vowels
 * (è ɛ, ò ɔ); unmarked e and o are read closed, and an unmarked word is stressed on its
 * next-to-last syllable, which is right for most words and wrong for the sdrucciole (mùsica),
 * which only a dictionary or an accent mark can tell. Doubled consonants are long.
 */
import type { PhoneSymbol } from "../contract.ts";
import { expandNumbers, type Language } from "./language.ts";
import { plainOnset, type WordPron } from "./phones.ts";
import { type Letter, romanceSyllables, sOnset } from "./romance.ts";
import { splitNumber } from "./text.ts";

const VOWELS: Record<string, [PhoneSymbol, boolean]> = {
  a: ["a", false], e: ["e", false], i: ["i", false], o: ["o", false], u: ["u", false],
  à: ["a", true], è: ["ɛ", true], é: ["e", true], ì: ["i", true], í: ["i", true], ò: ["ɔ", true], ó: ["o", true], ù: ["u", true], ú: ["u", true],
};
const isV = (c: string | undefined): boolean => !!c && c in VOWELS;
const FRONT = (c: string | undefined): boolean => !!c && "eiéèìí".includes(c);
const VOICED = new Set(["b", "d", "g", "l", "m", "n", "r", "v"]);
const SIMPLE: Record<string, PhoneSymbol> = { b: "b", d: "d", f: "f", l: "l", m: "m", p: "p", t: "t", v: "v", k: "k", w: "w", j: "j" };

/** Italian spelling to sounds. `w` is lower case. */
export function italianLetters(w: string): Letter[] {
  const out: Letter[] = [];
  const push = (ph: PhoneSymbol, long = false, extra: Partial<Letter> = {}) => out.push(long ? { ph, long, ...extra } : { ph, ...extra });
  const between = (i: number) => i > 0 && isV(w[i - 1]);
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const n = w[i + 1];
    if (isV(c)) {
      const [ph, accent] = VOWELS[c];
      push(ph, false, { accent, weak: !accent && (ph === "i" || ph === "u") });
      continue;
    }
    // a doubled letter: one long sound (cc, gg before e/i are handled with their letter)
    const double = n === c && c !== "c" && c !== "g" && c !== "s" && c !== "z";
    if (double) i++;
    switch (c) {
      case "c": {
        const dbl = n === "c";
        const j = dbl ? i + 2 : i + 1;
        if (dbl) i++;
        if (w[j] === "h") {
          push("k", dbl);
          i++;
        } else if (FRONT(w[j])) {
          push("tʃ", dbl);
          // "ci" before a vowel: the i is only spelling
          if (w[j] === "i" && isV(w[j + 1])) i++;
        } else if (w[j] === "q") {
          push("k", true);
          i++;
          if (w[i + 1] === "u") {
            push("w");
            i++;
          }
        } else push("k", dbl);
        break;
      }
      case "g": {
        const dbl = n === "g";
        const j = dbl ? i + 2 : i + 1;
        if (dbl) i++;
        if (w[j] === "h") {
          push("g", dbl);
          i++;
        } else if (!dbl && w[j] === "l" && w[j + 1] === "i") {
          push("ʎ", between(i));
          i++; // the l
          if (isV(w[j + 2])) i++; // the i, when only spelling
        } else if (!dbl && w[j] === "n") {
          push("ɲ", between(i));
          i++;
        } else if (FRONT(w[j])) {
          push("dʒ", dbl);
          if (w[j] === "i" && isV(w[j + 1])) i++;
        } else push("g", dbl);
        break;
      }
      case "s":
        if (n === "c" && FRONT(w[i + 2])) {
          push("ʃ", between(i));
          i++;
          if (w[i + 1] === "i" && isV(w[i + 2])) i++;
        } else if (n === "s") {
          push("s", true);
          i++;
        } else if ((between(i) && isV(n)) || VOICED.has(n ?? "")) push("z");
        else push("s");
        break;
      case "z":
        if (n === "z") {
          push("ts", true);
          i++;
        } else push(i === 0 ? "dz" : "ts");
        break;
      case "q":
        push("k");
        if (n === "u") {
          push("w");
          i++;
        }
        break;
      case "h":
        break;
      case "r":
        push(double ? "r" : "ɾ", double);
        break;
      case "n":
        push(n && "ckgq".includes(n) && !(n === "c" && FRONT(w[i + 2])) && !(n === "g" && FRONT(w[i + 2])) ? "ŋ" : "bp".includes(n ?? "") ? "m" : "n", double);
        break;
      case "x":
        push("k");
        push("s");
        break;
      case "y":
        push("i", false, { weak: true });
        break;
      default:
        if (SIMPLE[c]) push(SIMPLE[c], double);
    }
  }
  return out;
}

const FUNCTION = new Set(["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "e", "o", "che", "mi", "ti", "si", "ci", "vi", "ne", "del", "della", "dei", "al", "alla", "nel", "nella", "ma", "se", "non"]);

export function italianWord(text: string): WordPron {
  const w = text.toLowerCase().replace(/'/g, "");
  const syls = romanceSyllables(italianLetters(w), sOnset(plainOnset), (syls, marked) => (marked >= 0 ? marked : syls.length - 2));
  const func = FUNCTION.has(w);
  if (func) for (const s of syls) s.stress = 0;
  return { text, syls, func };
}

const UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const TENS = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];

function below1000(n: number): string {
  let s = "";
  if (n >= 100) s += (n >= 200 ? UNITS[Math.floor(n / 100)] : "") + "cento";
  const r = n % 100;
  if (r >= 20) {
    let tens = TENS[Math.floor(r / 10)];
    // venti + uno = ventuno, trenta + otto = trentotto
    if (r % 10 === 1 || r % 10 === 8) tens = tens.slice(0, -1);
    s += tens + (r % 10 ? (r % 10 === 3 ? "tré" : UNITS[r % 10]) : "");
  } else if (r > 0) s += UNITS[r];
  return s;
}

/** Italian writes a number as one word: 1999 → millenovecentonovantanove. */
export function italianNumber(digits: string): string[] {
  let n = Number(digits);
  if (!Number.isFinite(n) || digits.length > 12) return [...digits].map((d) => UNITS[Number(d)]);
  if (n === 0) return ["zero"];
  const out: string[] = [];
  const millions = Math.floor(n / 1e6);
  if (millions) out.push(...(millions === 1 ? ["un", "milione"] : [below1000(millions), "milioni"]));
  n %= 1e6;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  let rest = "";
  if (thousands) rest += thousands === 1 ? "mille" : below1000(thousands) + "mila";
  if (n) rest += below1000(n);
  if (rest) out.push(rest);
  return out;
}

export const italian: Language = {
  piecesReadAlone: true,
  expand: expandNumbers(
    (whole, frac) => [...italianNumber(whole), ...(frac ? ["virgola", ...italianNumber(frac)] : [])],
    (t) => splitNumber(t, true),
  ),
  word: (text) => italianWord(text),
};
