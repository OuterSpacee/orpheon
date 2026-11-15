// Build public/lang/en-dict.txt (the English pronouncing dictionary the language layer ships)
// from the CMU Pronouncing Dictionary, and copy its license beside it.
//
//   bun tools/lang-build-cmudict.ts            fetches cmudict.dict and LICENSE into out/cmudict/
//   bun tools/lang-build-cmudict.ts <dir>      uses <dir>/cmudict.dict and <dir>/LICENSE instead
//
// What goes in: the first pronunciation of every word spelt only with letters and apostrophes
// (a few common words take a later one, below), minus the words that a regular ending makes
// from a shorter word with exactly the same pronunciation (src/lang/en-dict.ts `derive`).
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Dictionary, derive, packDictionary, unpackDictionary } from "../src/lang/en-dict.ts";

const SOURCE = "https://raw.githubusercontent.com/cmusphinx/cmudict/master";

/** Words whose first entry is the rarer reading: which entry to take instead (1-based). */
const PREFER: Record<string, number> = { read: 2, live: 2, wind: 2, lead: 2, wound: 2, tear: 2 };

async function source(dir: string | undefined): Promise<{ dict: string; license: string }> {
  if (dir) return { dict: readFileSync(join(dir, "cmudict.dict"), "utf8"), license: readFileSync(join(dir, "LICENSE"), "utf8") };
  const cache = "out/cmudict";
  mkdirSync(cache, { recursive: true });
  for (const name of ["cmudict.dict", "LICENSE"]) {
    const path = join(cache, name);
    if (existsSync(path)) continue;
    const res = await fetch(`${SOURCE}/${name}`);
    if (!res.ok) throw new Error(`fetching ${name}: ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return source(cache);
}

const { dict, license } = await source(process.argv[2]);

// every reading of every plain word
const readings = new Map<string, string[][]>();
for (const raw of dict.split("\n")) {
  const line = raw.replace(/#.*/, "").trim();
  if (!line) continue;
  const [head, ...arpa] = line.split(/\s+/);
  const word = head.replace(/\(\d+\)$/, "");
  if (!/^[a-z][a-z']*$/.test(word)) continue;
  const list = readings.get(word) ?? [];
  list.push(arpa);
  readings.set(word, list);
}

const chosen = new Map<string, string[]>();
for (const [word, list] of readings) chosen.set(word, list[(PREFER[word] ?? 1) - 1] ?? list[0]);

// shortest first, so a word's base is settled before the word
const byLength = [...chosen.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
const kept = new Map<string, string[]>();
const keptDict = new Dictionary(kept);
let derived = 0;
for (const word of byLength) {
  const arpa = chosen.get(word)!;
  const made = derive(word, (w) => keptDict.lookup(w, 1));
  if (made && made.join(" ") === arpa.join(" ")) derived++;
  else kept.set(word, arpa);
}

const entries = [...kept.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const packed = packDictionary(entries);
mkdirSync("public/lang", { recursive: true });
writeFileSync("public/lang/en-dict.txt", packed);
writeFileSync(
  "public/lang/cmudict-LICENSE.txt",
  "public/lang/en-dict.txt is built from the CMU Pronouncing Dictionary\n(https://github.com/cmusphinx/cmudict) by tools/lang-build-cmudict.ts. Its license:\n\n" + license,
);

// the shipped file must give back every chosen pronunciation
const check = new Dictionary(unpackDictionary(packed));
let wrong = 0;
for (const [word, arpa] of chosen) if (check.lookup(word)?.join(" ") !== arpa.join(" ")) wrong++;
console.log(`${chosen.size} words: ${entries.length} kept, ${derived} made by endings; ${(statSync("public/lang/en-dict.txt").size / 1024).toFixed(0)} KB; ${wrong} lookups wrong`);
if (wrong) process.exit(1);
