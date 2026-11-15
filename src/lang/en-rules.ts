/**
 * English letter-to-sound rules, for words the dictionary does not have (names, new words,
 * typos). Written for Orpheon in the classic form of rewrite rules with a left and right
 * context (the form of Elovitz, Johnson, McHugh and Shore, "Letter-to-sound rules for automatic
 * translation of English text to phonetics", IEEE Trans. ASSP 24(6), 1976); the rules
 * themselves are our own and fewer. Then a stress guess from the word's shape and the ending,
 * and the unstressed vowels reduced, as English does.
 *
 * Context symbols in the rules:
 *   " " the edge of the word        #  one or more vowels        :  zero or more consonants
 *   ^  one consonant                +  e, i or y                 .  a voiced consonant
 *   %  a suffix: e, er, es, ed, ing, ely                         &  a hissing letter or pair
 *   @  a consonant after which "u" says "oo", not "you" (t s r d l z n j th ch sh)
 * Everything else stands for itself. The rules for a letter are tried in order; the first whose
 * text and both contexts match wins, so the specific ones come first.
 */

type Rule = [left: string, text: string, right: string, out: string];

const R: Record<string, Rule[]> = {
  a: [
    [" ", "a", " ", "AH"],
    ["", "augh", "", "AO"],
    ["", "au", "", "AO"],
    ["", "aw", "", "AO"],
    ["", "air", "", "EH R"],
    ["", "ai", "", "EY"],
    ["", "ay", "", "EY"],
    [" ", "are", " ", "AA R"],
    ["", "are", "", "EH R"],
    ["", "arr", "", "AE R"],
    ["w", "ar", "", "AO R"],
    [" ", "a", "r#", "AH"],
    ["", "ar", "", "AA R"],
    ["", "alk", "", "AO K"],
    ["", "alm", "", "AA M"],
    ["", "a", "ll", "AO"],
    ["", "a", "lt", "AO"],
    ["w", "a", "s", "AA"],
    ["w", "a", "sh", "AA"],
    ["w", "a", "tch", "AA"],
    ["", "ange", "", "EY N JH"],
    ["", "a", "tion", "EY"],
    ["", "a", "^e ", "EY"],
    ["", "a", "^es ", "EY"],
    ["", "a", "^ed ", "EY"],
    ["", "a", "^ing", "EY"],
    ["", "a", "^er ", "EY"],
    ["", "a", "^i#", "EY"],
    ["#:", "a", " ", "AH"],
    ["", "a", "", "AE"],
  ],
  b: [
    ["m", "b", " ", ""],
    ["", "b", "t", ""],
    ["", "bb", "", "B"],
    ["", "b", "", "B"],
  ],
  c: [
    ["", "chr", "", "K R"],
    ["s", "ch", "", "K"],
    ["", "ch", "", "CH"],
    ["", "ck", "", "K"],
    ["", "cc", "+", "K S"],
    ["", "cc", "", "K"],
    ["", "ci", "a", "SH"],
    ["", "ci", "ou", "SH"],
    ["", "c", "+", "S"],
    ["", "c", "", "K"],
  ],
  d: [
    ["", "dg", "", "JH"],
    ["", "dd", "", "D"],
    ["", "d", "", "D"],
  ],
  e: [
    [" :", "e", " ", "IY"],
    ["#:t", "ed", " ", "IH D"],
    ["#:d", "ed", " ", "IH D"],
    ["#:", "ed", " ", "D"],
    ["#:&", "es", " ", "IH Z"],
    ["#:", "es", " ", "Z"],
    ["#:", "ely", " ", "L IY"],
    ["#:", "ement", "", "M AH N T"],
    ["#:", "eful", "", "F AH L"],
    ["#:", "eness", "", "N AH S"],
    ["", "e", " ", ""],
    ["", "eau", "", "OW"],
    ["", "eigh", "", "EY"],
    ["c", "ei", "", "IY"],
    ["", "ei", "", "EY"],
    ["", "eer", "", "IH R"],
    ["", "ee", "", "IY"],
    ["", "ear", "^", "ER"],
    ["", "ear", "", "IH R"],
    ["", "ea", "", "IY"],
    ["", "ey", " ", "IY"],
    ["", "ey", "", "EY"],
    ["@", "ew", "", "UW"],
    ["", "ew", "", "Y UW"],
    ["", "eu", "", "Y UW"],
    ["", "err", "", "EH R"],
    ["", "er", "", "ER"],
    ["", "e", "^e ", "IY"],
    ["", "e", "", "EH"],
  ],
  f: [
    ["", "ff", "", "F"],
    ["", "f", "", "F"],
  ],
  g: [
    [" ", "gh", "", "G"],
    ["", "gh", "", ""],
    [" ", "gn", "", "N"],
    ["", "gn", " ", "N"],
    ["", "gg", "", "G"],
    ["", "g", "+", "JH"],
    ["", "g", "", "G"],
  ],
  h: [
    ["", "h", "#", "HH"],
    ["", "h", "", ""],
  ],
  i: [
    [" ", "i", " ", "AY"],
    ["", "igh", "", "AY"],
    ["#:", "ie", " ", "IY"],
    ["", "ie", " ", "AY"],
    ["", "ie", "", "IY"],
    ["", "i", "nd", "AY"],
    ["", "i", "ld", "AY"],
    ["", "i", "gn", "AY"],
    ["", "ir", "", "ER"],
    ["", "i", "^e ", "AY"],
    ["", "i", "^es ", "AY"],
    ["", "i", "^ed ", "AY"],
    ["", "i", "^ing", "AY"],
    ["", "i", "a", "IY"],
    ["", "i", "o", "IY"],
    ["", "i", "", "IH"],
  ],
  j: [["", "j", "", "JH"]],
  k: [
    [" ", "k", "n", ""],
    ["", "k", "", "K"],
  ],
  l: [
    ["#:^", "le", " ", "AH L"],
    ["", "ll", "", "L"],
    ["", "l", "", "L"],
  ],
  m: [
    ["", "mm", "", "M"],
    ["", "m", "", "M"],
  ],
  n: [
    ["", "nn", "", "N"],
    ["", "ng", "", "NG"],
    ["", "n", "k", "NG"],
    ["", "n", "", "N"],
  ],
  o: [
    [" ", "of", " ", "AH V"],
    ["", "oo", "k", "UH"],
    ["", "oo", "d", "UH"],
    ["", "oor", "", "AO R"],
    ["", "oo", "", "UW"],
    ["", "oa", "", "OW"],
    ["", "oe", " ", "OW"],
    ["", "oi", "", "OY"],
    ["", "oy", "", "OY"],
    ["#:", "ous", "", "AH S"],
    ["", "ough", "t", "AO"],
    ["", "ough", "", "OW"],
    ["", "oul", "d", "UH"],
    ["", "ou", "", "AW"],
    ["", "ow", "", "OW"],
    ["w", "or", "", "ER"],
    ["", "or", "", "AO R"],
    ["", "o", "^e ", "OW"],
    ["", "o", "^es ", "OW"],
    ["", "o", "^ed ", "OW"],
    ["", "o", "^ing", "OW"],
    ["", "o", "ld", "OW"],
    ["", "o", "ll", "OW"],
    ["", "o", " ", "OW"],
    ["", "o", "", "AA"],
  ],
  p: [
    ["", "ph", "", "F"],
    [" ", "ps", "", "S"],
    [" ", "pn", "", "N"],
    ["", "pp", "", "P"],
    ["", "p", "", "P"],
  ],
  q: [
    ["", "que", " ", "K"],
    ["", "qu", "", "K W"],
    ["", "q", "", "K"],
  ],
  r: [
    ["", "rr", "", "R"],
    ["", "rh", "", "R"],
    ["", "r", "", "R"],
  ],
  s: [
    ["", "sh", "", "SH"],
    ["#", "sion", "", "ZH AH N"],
    ["", "sion", "", "SH AH N"],
    ["#", "sure", "", "ZH ER"],
    ["", "sure", "", "SH ER"],
    ["", "ss", "", "S"],
    ["", "sc", "+", "S"],
    ["#", "s", "#", "Z"],
    ["", "s", "", "S"],
  ],
  t: [
    ["", "tch", "", "CH"],
    ["", "tion", "", "SH AH N"],
    ["", "ti", "al", "SH"],
    ["", "ti", "ous", "SH"],
    ["", "ture", "", "CH ER"],
    ["", "th", "", "TH"],
    ["", "tt", "", "T"],
    ["", "t", "", "T"],
  ],
  u: [
    [" ", "un", "", "AH N"],
    ["", "ur", "", "ER"],
    ["@", "ue", " ", "UW"],
    ["", "ue", " ", "Y UW"],
    ["g", "u", "e", ""],
    ["g", "u", "i", ""],
    ["", "ui", "", "UW"],
    ["@", "u", "^e ", "UW"],
    ["@", "u", "^ing", "UW"],
    ["", "u", "^e ", "Y UW"],
    ["", "u", "^ing", "Y UW"],
    ["", "u", "", "AH"],
  ],
  v: [["", "v", "", "V"]],
  w: [
    ["", "wh", "", "W"],
    ["", "wr", "", "R"],
    ["", "w", "", "W"],
  ],
  x: [
    [" ", "x", "", "Z"],
    ["", "x", "", "K S"],
  ],
  y: [
    [" ", "y", "#", "Y"],
    ["", "y", "#", "Y"],
    [" :", "y", " ", "AY"],
    ["#:^", "y", " ", "IY"],
    ["", "y", "^e ", "AY"],
    ["", "y", "", "IH"],
  ],
  z: [
    ["", "zz", "", "Z"],
    ["", "z", "", "Z"],
  ],
};

const V = "[aeiouy]";
const C = "[bcdfghjklmnpqrstvwxz]";
const PIECES: Record<string, string> = {
  "#": `${V}+`,
  ":": `${C}*`,
  "^": C,
  "+": "[eiy]",
  ".": "[bdvgjlmnrwz]",
  "%": "(?:er|es|ed|ing|ely|e)",
  "&": "(?:ch|sh|s|c|g|z|x|j)",
  "@": "(?:th|ch|sh|t|s|r|d|l|z|n|j)",
};
const pattern = (ctx: string): string => [...ctx].map((c) => PIECES[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");

interface Compiled {
  left: RegExp;
  text: string;
  right: RegExp;
  out: string[];
}
const RULES: Record<string, Compiled[]> = {};
for (const [letter, rules] of Object.entries(R)) {
  RULES[letter] = rules.map(([l, text, r, out]) => ({
    left: new RegExp(`${pattern(l)}$`),
    text,
    right: new RegExp(`^${pattern(r)}`),
    out: out ? out.split(" ") : [],
  }));
}

const ARPA_VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);
const VOICELESS = new Set(["P", "T", "K", "F", "TH", "S", "SH", "CH"]);

/** Endings that put the stress a fixed number of syllables from the end (1 = the last). */
const STRESS_FROM_END: [RegExp, number][] = [
  [/(ee|eer|oon|ique|esque|ette)$/, 1],
  [/(tion|sion|cian|tian|cial|tial|cious|tious|ient|ience|ic|ics)$/, 2],
  [/(ity|ety|ical|ify|ogy|graphy|ia|ium)$/, 3],
];
const UNSTRESSED_PREFIX = /^(a|be|de|re|un|in|im|con|com|pre|pro|dis|ex|mis|ob|sub|per|sur|ad)/;

/**
 * Spelling to ARPAbet with stress digits, as the dictionary writes it. `word` is lower case,
 * letters and apostrophes only.
 */
export function letterToSound(word: string): string[] {
  const w = ` ${word.replace(/[^a-z]/g, "")} `;
  const out: string[] = [];
  for (let i = 1; i < w.length - 1; ) {
    const rules = RULES[w[i]];
    let done = false;
    for (const r of rules ?? []) {
      if (!w.startsWith(r.text, i)) continue;
      if (!r.left.test(w.slice(0, i)) || !r.right.test(w.slice(i + r.text.length))) continue;
      out.push(...r.out);
      i += r.text.length;
      done = true;
      break;
    }
    if (!done) i++;
  }
  // a doubled sound across two rules (book-keeper) is said once
  const phones = out.filter((p, i) => i === 0 || p !== out[i - 1] || ARPA_VOWELS.has(p));
  // final -s and -ed take the voicing of the sound before them
  const n = phones.length;
  if (n >= 2 && VOICELESS.has(phones[n - 2])) {
    if (phones[n - 1] === "Z") phones[n - 1] = "S";
    if (phones[n - 1] === "D" && /ed$/.test(word)) phones[n - 1] = "T";
  }
  if (n >= 2 && phones[n - 1] === "S" && /([aeiou][ywe]|[^aeiou]e|ie)s$/.test(word) && !VOICELESS.has(phones[n - 2])) phones[n - 1] = "Z";
  return stressAndReduce(phones, word);
}

function stressAndReduce(phones: string[], word: string): string[] {
  const vowels = phones.flatMap((p, i) => (ARPA_VOWELS.has(p) ? [i] : []));
  const count = vowels.length;
  if (count === 0) return phones;
  let stressed = 0;
  if (count >= 2) {
    const rule = STRESS_FROM_END.find(([re]) => re.test(word));
    if (rule) stressed = Math.max(0, count - rule[1]);
    else if (count === 2) stressed = UNSTRESSED_PREFIX.test(word) && word.length > 4 ? 1 : 0;
    else stressed = count - 2;
  }
  const out = phones.map((p, i) => {
    const k = vowels.indexOf(i);
    if (k < 0) return p;
    if (k === stressed) return p + "1";
    // unstressed full vowels fall to schwa; the tense and gliding ones keep their quality
    if (p === "AE" || p === "AA" || p === "AH" || p === "AO" || p === "EH") return "AH0";
    return p + "0";
  });
  // a schwa before an r that closes its syllable is the r-colored schwa (doctor, zantor)
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i] === "AH0" && out[i + 1] === "R" && !ARPA_VOWELS.has((out[i + 2] ?? "").replace(/\d$/, ""))) out.splice(i, 2, "ER0");
  }
  return out;
}
