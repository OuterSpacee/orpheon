/**
 * Lyrics as a singer reads them, into the units sing() puts on notes, one a note:
 *
 *   "Twin-kle twin-kle lit-tle star"   a "-" inside a word splits it where the writer wants
 *   "Glo - ri - a" or "Glo -- ri -- a" a dash standing alone joins the pieces around it
 *   "Glo _ _ ri - a"                    a "_" holds the syllable before over one more note
 *   "fire~"  "fi~re"                    a "~" keeps what it joins on one note (in a word of
 *                                       one piece, the whole word)
 *
 * A word's syllables come from its pronunciation. When the writer splits it into as many
 * pieces as it has syllables, each piece is one syllable. Fewer pieces: neighbouring
 * syllables share a note (the later ones are sung at its end, like closing consonants).
 * More pieces: the extra ones hold the vowel before (e-ve-ry for a two-syllable "every").
 */
import type { Language } from "./language.ts";
import type { Seg, Syl } from "./phones.ts";
import type { Unit } from "./singing.ts";
import { scan } from "./text.ts";

/** Several syllables sung as one: the first's onset and vowel, then everything else. */
export function mergeSyllables(syls: Syl[]): Syl {
  if (syls.length === 1) return syls[0];
  const [head, ...rest] = syls;
  const tail: Seg[] = rest.flatMap((s) => [...s.onset, ...s.nucleus, ...s.coda]);
  return { onset: head.onset, nucleus: head.nucleus, coda: [...head.coda, ...tail], stress: syls.reduce((m, s) => (s.stress === 1 || m === 1 ? 1 : Math.max(m, s.stress)) as 0 | 1 | 2, 0 as 0 | 1 | 2) };
}

/** How many vowel letters groups a piece of written word has: a guess at its syllables. */
const vowelGroups = (piece: string): number => Math.max(1, (piece.toLowerCase().match(/[aeiouyàáâäèéêëìíîïòóôöùúûüæœ぀-ヿ]+/g) ?? []).length);

/**
 * Share `n` syllables among pieces in order, by weight: each piece gets at least one when
 * there are enough, and a run of pieces left with none hold the syllable before.
 */
export function share(weights: number[], n: number): number[] {
  const p = weights.length;
  if (n >= p) {
    const counts = weights.map(() => 1);
    let left = n - p;
    const total = weights.reduce((a, b) => a + b, 0);
    // the extra syllables go where the spelling has more vowels
    while (left > 0) {
      let best = 0;
      let bestNeed = -Infinity;
      counts.forEach((c, i) => {
        const need = (weights[i] / total) * n - c;
        if (need > bestNeed) {
          bestNeed = need;
          best = i;
        }
      });
      counts[best]++;
      left--;
    }
    return counts;
  }
  // fewer syllables than pieces: the syllables go to the first pieces of each stretch
  const counts = weights.map(() => 0);
  for (let s = 0; s < n; s++) counts[Math.floor((s * p) / n)]++;
  return counts;
}

/**
 * Like share(), but a piece that is only vowels after another piece (the second o of
 * "Glo-o-ry", the a of "A-a-men") is the one that holds, when there are pieces to spare.
 */
function sharePieces(pieces: string[], n: number): number[] {
  if (n >= pieces.length) return share(pieces.map(vowelGroups), n);
  const holds = pieces.map((p, i) => i > 0 && /^[aeiouyàáâäèéêëìíîïòóôöùúûü]+$/i.test(p));
  if (pieces.length - holds.filter(Boolean).length === n) return holds.map((h) => (h ? 0 : 1));
  return share(pieces.map(vowelGroups), n);
}

export interface Lyrics {
  units: Unit[];
  /** the words as written, indexed by the units' `word` */
  words: string[];
}

export function lyricUnits(lyrics: string, lang: Language): Lyrics {
  // join "a - b" and "a -- b" into "a-b"
  const text = lyrics
    .normalize("NFC")
    .replace(/\s+-{1,2}\s+/g, "-")
    .replace(/(\S)-{2,}(\S)/g, "$1-$2");
  const units: Unit[] = [];
  const words: string[] = [];
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    // holds: a token of "_", or "_" attached to a piece ("star_", "Twin-_-kle")
    const joined = token.includes("~");
    const entries: (string | null)[] = [];
    for (const part of token.replace(/~/g, "").split("-")) {
      const m = part.match(/^(_*)(.*?)(_*)$/)!;
      for (let i = 0; i < m[1].length; i++) entries.push(null);
      if (m[2]) entries.push(m[2]);
      for (let i = 0; i < m[3].length; i++) entries.push(null);
    }
    const pieces = entries.filter((e): e is string => e !== null);
    if (pieces.length === 0) {
      for (let i = 0; i < entries.length; i++) units.push({ kind: "hold" });
      continue;
    }
    const before = units.length;
    wordUnits(pieces, joined, lang, units, words);
    // put the holds back among the pieces' units, where the writer put them
    const made = units.splice(before);
    let piece = 0;
    for (const e of entries) {
      if (e === null) units.push({ kind: "hold" });
      else {
        // each piece made one unit (or, for a word read out as several, all of them on the first)
        const take = piece === pieces.length - 1 ? made.length : Math.min(1, made.length);
        units.push(...made.splice(0, take));
        piece++;
      }
    }
  }
  return { units, words };
}

/** The units of one written word, given as the pieces the writer split it into. */
function wordUnits(pieces: string[], joined: boolean, lang: Language, units: Unit[], words: string[]): void {
  // what the language says the word is: numbers become words, punctuation goes
  const plain = pieces.join("");
  const said = lang.expand(lang.scan ? lang.scan(plain) : scan(plain, lang.abbreviation)).filter((s): s is { word: string; spell?: boolean } => "word" in s);
  if (said.length === 0) return;
  if (said.length > 1 || said[0].word !== plain.replace(/[^\p{L}\p{M}'.ˈˌːˑ]/gu, "")) {
    // a number or an abbreviation: its own words, one syllable a note
    for (const s of said) {
      const w = lang.word(s.word, "song", s.spell);
      const index = words.push(s.word) - 1;
      for (const syl of w.syls) units.push({ kind: "syl", syl, word: index, text: s.word });
    }
    return;
  }
  const word = lang.word(said[0].word, "song", said[0].spell);
  const syls = word.syls.filter((s) => s.nucleus.length || s.onset.length);
  if (syls.length === 0) return;
  const index = words.push(plain.replace(/[.,;:!?¡¿"“”«»]+$/u, "").replace(/^[¡¿"“”«»]+/u, "")) - 1;
  if (pieces.length === 1 && !joined) {
    for (const syl of syls) units.push({ kind: "syl", syl, word: index, text: plain });
    return;
  }
  if (lang.piecesReadAlone && pieces.length > syls.length) {
    const alone = pieces.map((p) => lang.word(p, "song").syls.filter((s) => s.nucleus.length));
    if (alone.every((a) => a.length >= 1)) {
      alone.forEach((a, i) => units.push({ kind: "syl", syl: mergeSyllables(a), word: index, text: pieces[i] }));
      return;
    }
  }
  const counts = sharePieces(pieces, syls.length);
  let at = 0;
  counts.forEach((c, i) => {
    if (c === 0) units.push({ kind: "hold" });
    else units.push({ kind: "syl", syl: mergeSyllables(syls.slice(at, at + c)), word: index, text: pieces[i] });
    at += c;
  });
}
