/**
 * What every front end provides, and the one loop that runs any of them over a text: cut it
 * into pieces (text.ts), let the language read numbers, symbols and abbreviations as words,
 * pronounce each word, and keep the pauses.
 */
import type { Break, Token, WordPron } from "./phones.ts";
import { type Piece, scan, strongerBreak } from "./text.ts";

/** Speech reduces and runs sounds together; song keeps every syllable whole. */
export type Style = "speech" | "song";

export type Said = { word: string; spell?: boolean } | { brk: Break };

export interface Language {
  /** a word followed by a full stop that is an abbreviation, so the stop does not end a sentence */
  abbreviation?(word: string): boolean;
  /** pieces of text to plain words to pronounce (numbers written out) and pauses */
  expand(pieces: Piece[]): Said[];
  /** one plain word */
  word(text: string, style: Style, spell?: boolean): WordPron;
  /** changes across words (English "the" before a vowel) */
  adjust?(tokens: Token[], style: Style): void;
  /**
   * a sung word split into more pieces than it has syllables is read piece by piece (mi-o is
   * two syllables): right where spelling is close to sound, wrong for English (twin-kle)
   */
  piecesReadAlone?: boolean;
  /** scan the text differently (IPA, where a dot is a syllable break) */
  scan?(text: string): Piece[];
}

/** For languages whose only spoken symbols are numbers: read each through `number`. */
export function expandNumbers(number: (whole: string, frac: string) => string[], split: (text: string) => { whole: string; frac: string }): Language["expand"] {
  return (pieces) => {
    const out: Said[] = [];
    for (const p of pieces) {
      if (p.kind === "break") out.push({ brk: p.type });
      else if (p.kind === "word") out.push({ word: p.text });
      else if (p.kind === "number") {
        const { whole, frac } = split(p.text);
        out.push(...number(whole, frac).map((word) => ({ word })));
      }
    }
    return out;
  };
}

/** A text to words and pauses in one language. Words with no sound at all are left out. */
export function tokenize(text: string, lang: Language, style: Style): Token[] {
  const pieces = lang.scan ? lang.scan(text) : scan(text, lang.abbreviation);
  const tokens: Token[] = [];
  for (const s of lang.expand(pieces)) {
    if ("brk" in s) {
      const last = tokens[tokens.length - 1];
      if (!last) continue;
      if (last.kind === "break") last.type = strongerBreak(last.type, s.brk);
      else tokens.push({ kind: "break", type: s.brk });
      continue;
    }
    const word = lang.word(s.word, style, s.spell);
    if (word.syls.some((syl) => syl.nucleus.length || syl.onset.length || syl.coda.length)) tokens.push({ kind: "word", word });
  }
  lang.adjust?.(tokens, style);
  return tokens;
}
