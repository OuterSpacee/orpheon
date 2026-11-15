/**
 * Japanese from kana (hiragana and katakana) or romaji (Hepburn, with the Kunrei spellings si,
 * ti, tu, hu, zi accepted too). Kanji cannot be read without a dictionary and are skipped.
 *
 * Japanese counts morae, not syllables: ka, n, the second half of a long vowel. Each mora is a
 * syllable here, because a Japanese song gives each mora its own note; speech then folds a
 * long vowel's second mora back into a long vowel. っ (a doubled consonant) is not a mora of
 * its own here: it lengthens the consonant after it. i and u between voiceless consonants
 * (and the u of a final -su) are said faintly, as Tokyo speech does.
 */
import type { PhoneSymbol } from "../contract.ts";
import { expandNumbers, type Language } from "./language.ts";
import { type Seg, type Syl, VOICELESS, type WordPron } from "./phones.ts";

const HIRAGANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n'",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ゔ: "vu", ゎ: "wa", ゕ: "ka", ゖ: "ke",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };
const SMALL_V: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };

/** katakana are hiragana moved up by 0x60 */
const toHiragana = (c: string): string => {
  const code = c.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
};

/** Kana to romaji. Loanword kana (ティ, ドゥ) come out as t'i, d'u: a plain t or d. */
export function kanaToRomaji(text: string): string {
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = toHiragana(chars[i]);
    if (c === "っ") {
      out += "Q";
      continue;
    }
    if (c === "ー" || c === "〜") {
      const v = out.match(/[aiueo](?=[^aiueo]*$)/);
      if (v) out += v[0];
      continue;
    }
    if (SMALL_Y[c]) {
      // き + ゃ = kya; し + ゃ = sha
      if (/(sh|ch|j)i$/.test(out)) out = out.slice(0, -1) + SMALL_Y[c];
      else if (/i$/.test(out)) out = out.slice(0, -1) + "y" + SMALL_Y[c];
      else out += "y" + SMALL_Y[c];
      continue;
    }
    if (SMALL_V[c]) {
      // フ + ァ = fa; テ + ィ = t'i; ウ + ィ = wi
      if (/[aiueo]$/.test(out)) {
        const base = out.slice(0, -1);
        // the vowel before was a mora of its own (ウ): it becomes the glide
        if (/(^|[aiueo'])$/.test(base)) out = base + "w" + SMALL_V[c];
        else if (/[td]$/.test(base)) out = base + "'" + SMALL_V[c];
        else out = base + SMALL_V[c];
      } else out += SMALL_V[c];
      continue;
    }
    out += HIRAGANA[c] ?? (/[a-z']/i.test(c) ? c.toLowerCase() : "");
  }
  // っ doubles the consonant after it
  return out.replace(/Q(ch)/g, "t$1").replace(/Q([a-z])/g, "$1$1").replace(/Q/g, "");
}

/** romaji onsets, longest first */
const ONSETS: [string, PhoneSymbol[]][] = [
  ["ky", ["k", "j"]], ["gy", ["g", "j"]], ["sh", ["ɕ"]], ["sy", ["ɕ"]], ["ch", ["tʃ"]], ["ty", ["tʃ"]], ["cy", ["tʃ"]],
  ["jy", ["dʒ"]], ["zy", ["dʒ"]], ["dy", ["dʒ"]], ["ts", ["ts"]], ["ny", ["ɲ"]], ["hy", ["ç"]], ["by", ["b", "j"]],
  ["py", ["p", "j"]], ["my", ["m", "j"]], ["ry", ["ɾ", "j"]], ["t'", ["t"]], ["d'", ["d"]],
  ["j", ["dʒ"]], ["f", ["ɸ"]], ["k", ["k"]], ["g", ["g"]], ["s", ["s"]], ["z", ["dz"]], ["t", ["t"]], ["d", ["d"]],
  ["n", ["n"]], ["h", ["h"]], ["b", ["b"]], ["p", ["p"]], ["m", ["m"]], ["y", ["j"]], ["r", ["ɾ"]], ["l", ["ɾ"]],
  ["w", ["w"]], ["v", ["b"]], ["c", ["k"]],
];
const VOWEL: Record<string, PhoneSymbol> = { a: "a", i: "i", u: "ɯ", e: "e", o: "o" };

/** Romaji to morae. */
export function romajiMorae(text: string): Syl[] {
  const r = text.toLowerCase().normalize("NFD").replace(/([aiueo])̄/g, "$1$1").replace(/([aiueo])̂/g, "$1$1").replace(/[̀-ͯ]/g, "");
  const morae: Syl[] = [];
  let long = false;
  for (let i = 0; i < r.length; ) {
    const c = r[i];
    if (VOWEL[c]) {
      const prev = morae[morae.length - 1];
      const pv = prev?.nucleus[0]?.ph;
      const v = VOWEL[c];
      // aa, ii, uu, ee, oo, ou, ei: the second mora lengthens the first
      const lengthens = !!prev && prev.nucleus.length === 1 && (pv === v || (pv === "o" && v === "ɯ") || (pv === "e" && v === "i"));
      morae.push({ onset: [], nucleus: [{ ph: lengthens ? pv! : v }], coda: [], stress: 0, ...(lengthens ? { lengthens: true } : {}) });
      i++;
      continue;
    }
    if (c === "n" && (i + 1 >= r.length || r[i + 1] === "'" || (!VOWEL[r[i + 1]] && r[i + 1] !== "y"))) {
      // ん: the nasal takes the place of the sound after it
      const next = r[i + 1] === "'" ? r[i + 2] : r[i + 1];
      const ph: PhoneSymbol = next && "pbm".includes(next) ? "m" : next && "kg".includes(next) ? "ŋ" : "n";
      morae.push({ onset: [], nucleus: [{ ph }], coda: [], stress: 0 });
      i += r[i + 1] === "'" ? 2 : 1;
      continue;
    }
    if (c === r[i + 1] && c !== "n" && !VOWEL[c]) {
      long = true;
      i++;
      continue;
    }
    if (c === "t" && r.startsWith("tch", i)) {
      long = true;
      i++;
      continue;
    }
    const hit = ONSETS.find(([s]) => r.startsWith(s, i));
    if (!hit) {
      i++;
      continue;
    }
    i += hit[0].length;
    const v = VOWEL[r[i]];
    let onset = [...hit[1]];
    if (v) {
      i++;
      // the consonants that change before i and u
      const k = hit[0];
      if (k === "s" && v === "i") onset = ["ɕ"];
      else if (k === "z" && v === "i") onset = ["dʒ"];
      else if (k === "t" && v === "i") onset = ["tʃ"];
      else if (k === "d" && v === "i") onset = ["dʒ"];
      else if (k === "t" && v === "ɯ") onset = ["ts"];
      else if (k === "d" && v === "ɯ") onset = ["dz"];
      else if (k === "h" && v === "i") onset = ["ç"];
      else if (k === "h" && v === "ɯ") onset = ["ɸ"];
      else if (k === "n" && v === "i") onset = ["ɲ"];
      else if (k === "w" && v === "o") onset = [];
    }
    const segs: Seg[] = onset.map((ph, j) => (j === 0 && long ? { ph, long: true } : { ph }));
    long = false;
    // a consonant with no vowel after it (a romaji typo or a loan) gets the u Japanese adds
    morae.push({ onset: segs, nucleus: [{ ph: v ?? "ɯ" }], coda: [], stress: 0 });
  }
  // faint vowels: i and u between voiceless consonants, and the final u of -su
  for (let k = 0; k < morae.length; k++) {
    const m = morae[k];
    const v = m.nucleus[0]?.ph;
    if ((v !== "i" && v !== "ɯ") || m.lengthens || !m.onset.length) continue;
    const before = m.onset[m.onset.length - 1].ph;
    const next = morae[k + 1];
    const after = next && !next.lengthens ? next.onset[0]?.ph : undefined;
    const voicelessBefore = VOICELESS.has(before);
    if (voicelessBefore && ((after && VOICELESS.has(after)) || (k === morae.length - 1 && v === "ɯ" && (before === "s" || before === "ts")))) m.nucleus = [{ ph: v, faint: true }];
  }
  return morae;
}

export function japaneseWord(text: string): WordPron {
  // the particles は and へ are said wa and e
  // (and in the greetings that end in the particle: こんにちは)
  const t = text === "は" ? "wa" : text === "へ" ? "e" : text.replace(/(こんにちは|こんばんは)$/, (g) => g.slice(0, -1) + "わ");
  const romaji = /[぀-ヿ]/.test(t) ? kanaToRomaji(t) : t;
  return { text, syls: romajiMorae(romaji) };
}

const DIGITS = ["zero", "ichi", "ni", "san", "yon", "go", "roku", "nana", "hachi", "kyuu"];
const HUNDREDS: Record<number, string> = { 1: "hyaku", 3: "sanbyaku", 6: "roppyaku", 8: "happyaku" };
const THOUSANDS: Record<number, string> = { 1: "sen", 3: "sanzen", 8: "hassen" };

function below10000(n: number): string[] {
  const out: string[] = [];
  const th = Math.floor(n / 1000);
  if (th) out.push(THOUSANDS[th] ?? DIGITS[th] + "sen");
  const h = Math.floor((n % 1000) / 100);
  if (h) out.push(HUNDREDS[h] ?? DIGITS[h] + "hyaku");
  const t = Math.floor((n % 100) / 10);
  if (t) out.push(t === 1 ? "juu" : DIGITS[t] + "juu");
  if (n % 10) out.push(DIGITS[n % 10]);
  return out;
}

export function japaneseNumber(digits: string): string[] {
  const n = Number(digits);
  if (!Number.isFinite(n) || n >= 1e8) return [...digits].map((d) => DIGITS[Number(d)]);
  if (n === 0) return ["zero"];
  const man = Math.floor(n / 10000);
  return [...(man ? [...below10000(man), "man"] : []), ...below10000(n % 10000)];
}

export const japanese: Language = {
  piecesReadAlone: true,
  expand: expandNumbers(
    (whole, frac) => [...japaneseNumber(whole), ...(frac ? ["ten", ...[...frac].map((d) => DIGITS[Number(d)])] : [])],
    (t) => {
      const [whole, frac = ""] = t.replace(/,/g, "").split(".");
      return { whole, frac };
    },
  ),
  word: (text) => japaneseWord(text),
};
