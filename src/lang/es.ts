/**
 * Spanish, as most of the Spanish-speaking world says it: s for c and z (seseo), y for ll
 * (yeísmo), and the soft b, d, g (β, ð, ɣ) between vowels. Spelling is close to sound, so the
 * rules read it left to right. Stress: the written accent, else the next-to-last syllable when
 * the word ends in a vowel, n or s, else the last.
 */
import type { PhoneSymbol } from "../contract.ts";
import { expandNumbers, type Language } from "./language.ts";
import { plainOnset, type WordPron } from "./phones.ts";
import { type Letter, romanceSyllables } from "./romance.ts";
import { splitNumber } from "./text.ts";

const VOWELS: Record<string, [PhoneSymbol, boolean]> = {
  a: ["a", false], e: ["e", false], i: ["i", false], o: ["o", false], u: ["u", false],
  á: ["a", true], é: ["e", true], í: ["i", true], ó: ["o", true], ú: ["u", true], ü: ["u", false],
};
const isV = (c: string | undefined): boolean => !!c && c in VOWELS;
const FRONT = (c: string | undefined): boolean => c === "e" || c === "i" || c === "é" || c === "í";
const VOICED = new Set(["b", "d", "g", "l", "m", "n", "r", "v", "y"]);

/** Spanish spelling to sounds. `w` is lower case. */
export function spanishLetters(w: string): Letter[] {
  const out: Letter[] = [];
  const push = (ph: PhoneSymbol, extra: Partial<Letter> = {}) => out.push({ ph, ...extra });
  /** after a pause or a nasal (and for d, after l) a stop stays a stop */
  const hard = (i: number, d = false) => i === 0 || "mn".includes(w[i - 1]) || (d && w[i - 1] === "l");
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const n = w[i + 1];
    if (isV(c)) {
      const [ph, accent] = VOWELS[c];
      push(ph, { accent, weak: !accent && (ph === "i" || ph === "u") });
      continue;
    }
    switch (c) {
      case "b":
      case "v":
        push(hard(i) ? "b" : "β");
        break;
      case "c":
        if (n === "h") {
          push("tʃ");
          i++;
        } else if (FRONT(n)) push("s");
        else push("k");
        break;
      case "d":
        push(hard(i, true) ? "d" : "ð");
        break;
      case "g":
        if (FRONT(n)) push("x");
        else if (n === "u" && FRONT(w[i + 2])) {
          push(hard(i) ? "g" : "ɣ");
          i++; // the u only keeps the g hard
        } else push(hard(i) ? "g" : "ɣ");
        break;
      case "h":
        break;
      case "j":
        push("x");
        break;
      case "l":
        if (n === "l") {
          push("j");
          i++;
        } else push("l");
        break;
      case "ñ":
        push("ɲ");
        break;
      case "n": {
        const next = w[i + 1];
        push(next === "b" || next === "v" || next === "p" || next === "m" ? "m" : (next === "c" && !FRONT(w[i + 2])) || next === "g" || next === "j" || next === "q" || next === "k" ? "ŋ" : "n");
        break;
      }
      case "q":
        push("k");
        if (n === "u") i++;
        break;
      case "r":
        if (n === "r") {
          push("r");
          i++;
        } else push(i === 0 || "nls".includes(w[i - 1]) ? "r" : "ɾ");
        break;
      case "s":
        push(VOICED.has(n ?? "") ? "z" : "s");
        break;
      case "x":
        // México and its family keep the old spelling of j
        if (/^m[eé]xic/.test(w)) push("x");
        else {
          push("k");
          push("s");
        }
        break;
      case "y":
        // a vowel at the end of a word (hoy, muy) and as the word "y"; a consonant elsewhere
        if (i === w.length - 1 || !isV(n)) push("i", { weak: w.length > 1 });
        else push("j");
        break;
      case "z":
        push("s");
        break;
      case "w":
        push("w");
        break;
      case "k":
        push("k");
        break;
      case "f":
      case "m":
      case "p":
      case "t":
        push(c);
        break;
    }
  }
  return out;
}

const FUNCTION = new Set(["el", "la", "los", "las", "lo", "le", "les", "un", "una", "unos", "unas", "de", "del", "a", "al", "en", "y", "e", "o", "u", "que", "se", "me", "te", "nos", "os", "mi", "mis", "tu", "tus", "su", "sus", "por", "con", "sin", "para", "pero", "si", "como", "cuando", "donde"]);

export function spanishWord(text: string): WordPron {
  const w = text.toLowerCase();
  const syls = romanceSyllables(spanishLetters(w), plainOnset, (syls, marked) => {
    if (marked >= 0) return marked;
    return /[aeiouns]$/.test(w) ? syls.length - 2 : syls.length - 1;
  });
  const func = FUNCTION.has(w);
  if (func) for (const s of syls) s.stress = 0;
  return { text, syls, func };
}

const UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function below1000(n: number): string[] {
  if (n === 100) return ["cien"];
  const out: string[] = [];
  if (n >= 100) out.push(HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 30) out.push(TENS[Math.floor(r / 10)], ...(r % 10 ? ["y", UNITS[r % 10]] : []));
  else if (r > 0 || n === 0) out.push(UNITS[r]);
  return out;
}

export function spanishNumber(digits: string): string[] {
  let n = Number(digits);
  if (!Number.isFinite(n) || digits.length > 12) return [...digits].map((d) => UNITS[Number(d)]);
  if (n === 0) return ["cero"];
  const out: string[] = [];
  const millions = Math.floor(n / 1e6);
  if (millions) out.push(...(millions === 1 ? ["un", "millón"] : [...below1000(millions), "millones"]));
  n %= 1e6;
  const thousands = Math.floor(n / 1000);
  if (thousands) out.push(...(thousands === 1 ? ["mil"] : [...below1000(thousands), "mil"]));
  n %= 1000;
  if (n) out.push(...below1000(n));
  return out;
}

export const spanish: Language = {
  piecesReadAlone: true,
  expand: expandNumbers(
    (whole, frac) => [...spanishNumber(whole), ...(frac ? ["coma", ...spanishNumber(frac)] : [])],
    (t) => splitNumber(t, true),
  ),
  word: (text) => spanishWord(text),
};
