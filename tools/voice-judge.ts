// The intelligibility judge: can a listener that has never heard this voice tell what it says?
//
//   bun tools/voice-judge.ts                    the sentences and words below, through speak()
//   bun tools/voice-judge.ts --hand             the hand-written phones below (no language layer)
//   bun tools/voice-judge.ts --model base.en    another Whisper (small.en by default; medium.en, small)
//   bun tools/voice-judge.ts --body alto        another singer
//   bun tools/voice-judge.ts --only fox         only the lines containing this
//
// Each line is rendered to out/judge/*.wav (16 kHz), transcribed by Whisper (faster_whisper,
// offline, a model already in the cache), and scored by how many of its words come back in
// order. The number printed last is the fraction of all words understood. The judge is not to
// be tuned: change the voice, not this list or the scoring.
import { mkdirSync } from "node:fs";
import { BODIES } from "../src/contract.ts";
import type { Body, Score } from "../src/contract.ts";
import { wav } from "../tests/voice/measure.ts";
import { renderScore, scoreOf } from "./voice-score.ts";

const SENTENCES = [
  "The quick brown fox jumps over the lazy dog.",
  "She sells sea shells by the sea shore.",
  "Please call me in the morning.",
  "I would like a cup of tea.",
  "Where are you going today?",
  "The sun is shining on the water.",
  "My name is Orpheon and I can sing.",
  "Open the window and let the air in.",
  "We went to the market to buy some bread.",
  "How much does this cost?",
  "The children are playing in the garden.",
  "Thank you very much for your help.",
  "It is raining and I forgot my umbrella.",
  "Good morning, how are you?",
  "This is a test of the voice.",
  "One two three four five six seven eight nine ten.",
  "hello", "water", "music", "yes", "no", "mother", "seven", "apple", "thank you", "good night",
  "beautiful", "today", "people", "river", "children", "fish",
];

/** Words written out by hand as phones, for tuning the voice before the language layer existed. */
const BY_HAND: [string, string][] = [
  ["hello", "h ə ˈl o ʊ"],
  ["mama", "ˈm ɑː m ə"],
  ["papa", "ˈp ɑː p ə"],
  ["yes", "ˈj ɛ s"],
  ["no", "ˈn o ʊ"],
  ["see", "ˈs iː"],
  ["she", "ˈʃ iː"],
  ["tea", "ˈt iː"],
  ["two", "ˈt uː"],
  ["key", "ˈk iː"],
  ["go", "ˈg o ʊ"],
  ["day", "ˈd e ɪ"],
  ["bee", "ˈb iː"],
  ["five", "ˈf a ɪ v"],
  ["seven", "ˈs ɛ v ə n"],
  ["water", "ˈw ɔː t ɚ"],
  ["music", "ˈm j uː z ɪ k"],
  ["red", "ˈɹ ɛ d"],
  ["yellow", "ˈj ɛ l o ʊ"],
  ["thank you", "ˈθ æ ŋ k | j uː"],
  ["good morning", "g ʊ d | ˈm ɔː ɹ n ɪ ŋ"],
  ["i love you", "a ɪ | ˈl ʌ v | j uː"],
  ["how are you", "ˈh a ʊ | ɑː ɹ | ˈj uː"],
  ["the sun is shining", "ð ə | ˈs ʌ n | ɪ z | ˈʃ a ɪ n ɪ ŋ"],
  ["we sing a song", "w iː | ˈs ɪ ŋ | ə | ˈs ɔː ŋ"],
  ["one two three", "ˈw ʌ n _:0.12 ˈt uː _:0.12 ˈθ ɹ iː"],
];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const model = flag("model", "small.en");
const bodyName = flag("body", "tenor");
const only = flag("only", "");
const byHand = args.includes("--hand");
const body: Body = BODIES[bodyName as keyof typeof BODIES];
const RATE = 16000;

const lines: { text: string; score: Score }[] = [];
if (byHand) {
  for (const [text, phones] of BY_HAND) lines.push({ text, score: scoreOf(phones, { body }) });
} else {
  const language = await import("../src/lang/index.ts");
  await language.ready("en");
  for (const text of SENTENCES) lines.push({ text, score: language.speak(text, { lang: "en" }) });
}

mkdirSync("out/judge", { recursive: true });
const manifest: { file: string; text: string }[] = [];
const began = performance.now();
let seconds = 0;
for (const [i, line] of lines.entries()) {
  if (only && !line.text.includes(only)) continue;
  const file = `out/judge/${String(i).padStart(2, "0")}.wav`;
  const sound = renderScore(line.score, body, RATE, 0.3);
  seconds += sound.length / RATE;
  await Bun.write(file, wav(sound, RATE));
  manifest.push({ file, text: line.text });
}
console.log(`rendered ${seconds.toFixed(1)} s of speech in ${((performance.now() - began) / 1000).toFixed(1)} s`);
await Bun.write("out/judge/manifest.json", JSON.stringify(manifest));

const python = Bun.spawnSync(["python", "tools/voice-judge.py", "out/judge/manifest.json", model], {
  env: { ...process.env, HF_HUB_OFFLINE: "1", PYTHONIOENCODING: "utf-8" },
  stderr: "pipe",
});
if (python.exitCode !== 0) {
  console.error(python.stderr.toString());
  process.exit(1);
}
const heard = python.stdout.toString().trim().split("\n").map((row) => JSON.parse(row) as { file: string; heard: string });

const NUMBERS: Record<string, string> = { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };
const wordsOf = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => NUMBERS[w] ?? w);

/** How many of `want` come back in `got`, in order (the longest common subsequence). */
function understood(want: string[], got: string[]): number {
  const row = new Array(got.length + 1).fill(0);
  for (const w of want) {
    let diagonal = 0;
    for (let j = 1; j <= got.length; j++) {
      const up = row[j];
      row[j] = w === got[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = up;
    }
  }
  return row[got.length];
}

let right = 0;
let total = 0;
for (const [i, item] of manifest.entries()) {
  const want = wordsOf(item.text);
  const got = wordsOf(heard[i].heard);
  const n = understood(want, got);
  right += n;
  total += want.length;
  console.log(`${n === want.length ? "ok  " : n ? "part" : "miss"} ${n}/${want.length}  ${item.text}  ->  ${heard[i].heard}`);
}
console.log(`${model}, ${bodyName}: understood ${right} of ${total} words = ${((100 * right) / total).toFixed(1)}%`);
