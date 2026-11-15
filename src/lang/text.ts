/**
 * Written text cut into what the front ends read: words, numbers, symbols and the pauses that
 * punctuation asks for. No language knowledge here beyond which marks are punctuation; each
 * front end decides what a word, a number or a symbol sounds like.
 */
import type { Break } from "./phones.ts";

export type Piece =
  | { kind: "word"; text: string }
  | { kind: "number"; text: string; /** "st", "nd", "rd", "th" after it */ ordinal?: string }
  | { kind: "symbol"; text: string }
  | { kind: "break"; type: Break };

/** Breaks: the stronger of two in a row wins. */
const STRENGTH: Record<Break, number> = { comma: 1, colon: 2, stop: 3, question: 3, exclaim: 3, paragraph: 4 };

export function strongerBreak(a: Break, b: Break): Break {
  return STRENGTH[b] > STRENGTH[a] ? b : a;
}

const BREAK_OF: Record<string, Break> = {
  ",": "comma", "、": "comma", "，": "comma", "(": "comma", ")": "comma", "—": "comma", "–": "comma",
  ";": "colon", ":": "colon", "；": "colon", "：": "colon",
  ".": "stop", "。": "stop", "…": "stop",
  "?": "question", "？": "question", "¿": "comma",
  "!": "exclaim", "！": "exclaim", "¡": "comma",
};

const SYMBOLS = new Set(["-", "$", "£", "€", "¥", "%", "&", "+", "=", "@", "°", "#", "×", "/"]);

/**
 * Cut text into pieces. `abbreviation(word)` says whether a word followed by a full stop is an
 * abbreviation (Mr., etc.), so its stop is not a sentence end unless the text ends there.
 */
export function scan(text: string, abbreviation: (word: string) => boolean = () => false): Piece[] {
  const s = text.normalize("NFC").replace(/[’‘ʼ`]/g, "'").replace(/\r/g, "");
  const out: Piece[] = [];
  const pushBreak = (type: Break) => {
    const last = out[out.length - 1];
    if (last?.kind === "break") last.type = strongerBreak(last.type, type);
    else if (out.length) out.push({ kind: "break", type });
  };
  const re = /(\d+(?:[.,]\d+)*)(st|nd|rd|th)?|(?:\p{L}\.){2,}|[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*|\n[ \t]*\n|[.!?…。？！]+|\s+-+\s+|\S/gu;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const tok = m[0];
    if (m[1] !== undefined) {
      out.push({ kind: "number", text: m[1], ordinal: m[2]?.toLowerCase() });
      continue;
    }
    if (/^(\p{L}\.){2,}$/u.test(tok)) {
      // initials and dotted abbreviations: U.S.A., e.g.
      out.push({ kind: "word", text: tok });
      if (/^\s*$/.test(s.slice(re.lastIndex))) pushBreak("stop");
      continue;
    }
    if (/^[\p{L}\p{M}]/u.test(tok)) {
      // a word: hyphens join its parts in writing, but each part is said as a word
      const after = s.slice(re.lastIndex);
      if (after.startsWith(".") && abbreviation(tok)) {
        re.lastIndex++;
        out.push({ kind: "word", text: tok + "." });
        // the abbreviation ends the text, or ends a sentence before a capital: keep the stop
        if (/^\.\s*$/.test(after) || /^\.\s*\n\s*\n/.test(after)) pushBreak("stop");
        continue;
      }
      for (const part of tok.split("-")) if (part) out.push({ kind: "word", text: part });
      continue;
    }
    if (/^\n[ \t]*\n$/.test(tok)) {
      pushBreak("paragraph");
      continue;
    }
    if (/^\s+-+\s+$/.test(tok)) {
      pushBreak("comma");
      continue;
    }
    if (/^[.!?…。？！]+$/.test(tok)) {
      // "?!" asks; "..." trails off like a stop
      const type: Break = /[?？]/.test(tok) ? "question" : /[!！]/.test(tok) ? "exclaim" : "stop";
      pushBreak(type);
      continue;
    }
    const b = BREAK_OF[tok];
    if (b) pushBreak(b);
    else if (SYMBOLS.has(tok)) out.push({ kind: "symbol", text: tok });
    // anything else (quotes, brackets, emoji) is not said
  }
  return out;
}

/** "1,234.5" → { whole: "1234", frac: "5" }; a comma before exactly three digits groups thousands. */
export function splitNumber(text: string, decimalComma = false): { whole: string; frac: string } {
  let t = text;
  if (decimalComma) t = t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  else t = t.replace(/,(?=\d{3}(\D|$))/g, "");
  const [whole, frac = ""] = t.split(/[.,]/);
  return { whole, frac };
}
