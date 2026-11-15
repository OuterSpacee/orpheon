/**
 * The English pronouncing dictionary: CMU Pronouncing Dictionary entries (public/lang/
 * cmudict-LICENSE.txt), packed small by tools/lang-build-cmudict.ts into public/lang/en-dict.txt.
 *
 * The file is one entry a line, sorted. Each line starts with one character saying how many
 * letters it shares with the line before (char code minus 48), then the rest of the word, a
 * space, and the pronunciation with one character per ARPAbet phone (the table below; a vowel's
 * character also says its stress).
 *
 * Words that regular English endings make from a shorter word (dogs, named, walking, quickly)
 * are left out when the rule below gives exactly the dictionary's own pronunciation, and
 * `lookup` makes them again. So the file and `derive` belong together: change the endings and
 * rebuild the file.
 */

/** ARPAbet consonants and their characters in the file. */
const CONSONANTS: [string, string][] = [
  ["B", "b"], ["CH", "c"], ["D", "d"], ["DH", "D"], ["F", "f"], ["G", "g"], ["HH", "h"], ["JH", "j"],
  ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["NG", "N"], ["P", "p"], ["R", "r"], ["S", "s"],
  ["SH", "S"], ["T", "t"], ["TH", "T"], ["V", "v"], ["W", "w"], ["Y", "y"], ["Z", "z"], ["ZH", "Z"],
];
const VOWEL_NAMES = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
/** one character per vowel, by stress 0, 1, 2 */
const VOWEL_CHARS = ["aquo01ex2i34567", "AQUOWYERJIFBCHK", "89!#$%&()*+,-./"];

const TO_CHAR = new Map<string, string>();
const FROM_CHAR = new Map<string, string>();
for (const [p, c] of CONSONANTS) {
  TO_CHAR.set(p, c);
  FROM_CHAR.set(c, p);
}
VOWEL_NAMES.forEach((v, i) => {
  for (let s = 0; s < 3; s++) {
    TO_CHAR.set(v + s, VOWEL_CHARS[s][i]);
    FROM_CHAR.set(VOWEL_CHARS[s][i], v + s);
  }
});

/** "K AE1 T" → the file's characters */
export function packPron(arpa: string[]): string {
  return arpa
    .map((p) => {
      const c = TO_CHAR.get(p);
      if (!c) throw new Error(`not an ARPAbet phone: ${p}`);
      return c;
    })
    .join("");
}

export function unpackPron(packed: string): string[] {
  return [...packed].map((c) => {
    const p = FROM_CHAR.get(c);
    if (!p) throw new Error(`not a dictionary character: ${c}`);
    return p;
  });
}

/** Lines of the packed file, from sorted [word, ARPAbet] entries. */
export function packDictionary(entries: [string, string[]][]): string {
  const lines: string[] = [];
  let prev = "";
  for (const [word, arpa] of entries) {
    let shared = 0;
    while (shared < prev.length && shared < word.length && shared < 60 && prev[shared] === word[shared]) shared++;
    lines.push(String.fromCharCode(48 + shared) + word.slice(shared) + " " + packPron(arpa));
    prev = word;
  }
  return lines.join("\n") + "\n";
}

/** The packed file back into a map from word to ARPAbet phones. */
export function unpackDictionary(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let prev = "";
  for (const line of text.split("\n")) {
    if (!line) continue;
    const space = line.indexOf(" ");
    const word = prev.slice(0, line.charCodeAt(0) - 48) + line.slice(1, space);
    map.set(word, unpackPron(line.slice(space + 1)));
    prev = word;
  }
  return map;
}

const VOICELESS_END = new Set(["P", "T", "K", "F", "TH"]);
const SIBILANT_END = new Set(["S", "Z", "SH", "ZH", "CH", "JH"]);

/** -s, -'s: "iz" after a hiss, "s" after another voiceless sound, else "z" */
function plural(base: string[]): string[] {
  const last = base[base.length - 1];
  if (SIBILANT_END.has(last)) return [...base, "IH0", "Z"];
  if (VOICELESS_END.has(last)) return [...base, "S"];
  return [...base, "Z"];
}

/** -ed: "id" after t or d, "t" after another voiceless sound, else "d" */
function past(base: string[]): string[] {
  const last = base[base.length - 1];
  if (last === "T" || last === "D") return [...base, "IH0", "D"];
  if (VOICELESS_END.has(last) || last === "S" || last === "SH" || last === "CH") return [...base, "T"];
  return [...base, "D"];
}

/** Endings that add sounds to the word they end, in the order they are tried. */
const ENDINGS: { end: string; bases: (stem: string) => string[]; add: (base: string[]) => string[] }[] = [
  { end: "'s", bases: (s) => [s], add: plural },
  { end: "s'", bases: (s) => [s + "s", s], add: (b) => b },
  { end: "ies", bases: (s) => [s + "y"], add: plural },
  { end: "es", bases: (s) => [s, s + "e"], add: plural },
  { end: "s", bases: (s) => [s], add: plural },
  { end: "ied", bases: (s) => [s + "y"], add: past },
  { end: "ed", bases: (s) => [s, s + "e", doubled(s)], add: past },
  { end: "ing", bases: (s) => [s, s + "e", doubled(s)], add: (b) => [...b, "IH0", "NG"] },
  { end: "ly", bases: (s) => [s], add: (b) => [...b, "L", "IY0"] },
  { end: "ness", bases: (s) => [s], add: (b) => [...b, "N", "AH0", "S"] },
  { end: "ment", bases: (s) => [s], add: (b) => [...b, "M", "AH0", "N", "T"] },
  { end: "ful", bases: (s) => [s], add: (b) => [...b, "F", "AH0", "L"] },
  { end: "less", bases: (s) => [s], add: (b) => [...b, "L", "AH0", "S"] },
  { end: "er", bases: (s) => [s, s + "e", doubled(s)], add: (b) => [...b, "ER0"] },
  { end: "ers", bases: (s) => [s, s + "e", doubled(s)], add: (b) => [...b, "ER0", "Z"] },
  { end: "est", bases: (s) => [s, s + "e", doubled(s)], add: (b) => [...b, "AH0", "S", "T"] },
];

/** "stopp" → "stop": a consonant doubled before an ending */
function doubled(stem: string): string {
  const n = stem.length;
  return n >= 3 && stem[n - 1] === stem[n - 2] && !"aeiou".includes(stem[n - 1]) ? stem.slice(0, -1) : "";
}

/**
 * A word's pronunciation made from a shorter word and a regular ending, or null. `find` looks
 * the shorter word up (and may itself derive it).
 */
export function derive(word: string, find: (w: string) => string[] | undefined): string[] | null {
  for (const e of ENDINGS) {
    if (!word.endsWith(e.end) || word.length - e.end.length < 2) continue;
    const stem = word.slice(0, word.length - e.end.length);
    for (const b of e.bases(stem)) {
      if (!b || b === word) continue;
      const base = find(b);
      if (base) return e.add(base);
    }
  }
  return null;
}

/** A dictionary with the derived words made on demand. */
export class Dictionary {
  constructor(readonly entries: Map<string, string[]>) {}
  /** ARPAbet phones with stress digits, or undefined when neither the word nor a base is in it. */
  lookup = (word: string, depth = 0): string[] | undefined => {
    const hit = this.entries.get(word);
    if (hit) return hit;
    if (depth > 2) return undefined;
    return derive(word, (w) => this.lookup(w, depth + 1)) ?? undefined;
  };
}
