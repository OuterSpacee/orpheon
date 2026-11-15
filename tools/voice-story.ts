// The story test: Orpheon reads a real narration, sentence by sentence, and Whisper (the judge's
// listener) writes down what it hears. The same narration spoken by a studio voice is the
// ceiling: what the listener understands of the best voice we have, on the same words.
//
//   bun tools/voice-story.ts                     the tuning part (the first paragraph)
//   bun tools/voice-story.ts --part held         the rest, kept back: never tune against it
//   bun tools/voice-story.ts --part all --body alto --model medium.en
//
// The narration is the owner's (an ElevenLabs reading of a script about Hiroo Onoda) and stays
// out of git, in out/reference/:
//   narration.mp3          the reading
//   narration-heard.txt    Whisper small.en's transcript of it, a line per segment:
//                          "<start s> <end s>  <text>" (made once from narration-16k.wav)
// The words scored are that transcript with the listener's slips on names put right (FIXES).
// Change the voice, not this file, to raise the score.
import { BODIES } from "../src/contract.ts";
import type { Body } from "../src/contract.ts";
import { ready, speak } from "../src/lang/index.ts";
import { renderScore } from "./voice-score.ts";
import { listen, understood, wordsOf } from "./listener.ts";
import { mkdirSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const part = flag("part", "tune");
const bodyName = flag("body", "tenor");
const model = flag("model", "small.en");
const body: Body = BODIES[bodyName as keyof typeof BODIES];
/** The tuning part ends with the first paragraph, at this second of the reading. */
const TUNE_UNTIL = 131;

/** Where the listener misheard the reading itself: names, and two words it heard twice. */
const FIXES: [RegExp, string][] = [
  [/\b(Hiru|Kiru) Onoda\b/g, "Hiroo Onoda"],
  [/\bAnoda\b/g, "Onoda"],
  [/\bKazuka\b/g, "Kozuka"],
  [/\bNoriyo\b/g, "Norio"],
  [/\bHangkao\b/g, "Hankou"],
  [/\bunrecinded\b/g, "unrescinded"],
  [/\bEven Even\b/g, "Even"],
  [/\bThen, in In October\b/g, "Then, in October"],
];

const source = "out/reference/narration-heard.txt";
if (!existsSync(source)) {
  console.error(`${source} is missing: see the header of this file.`);
  process.exit(1);
}
const segments = (await Bun.file(source).text())
  .trim()
  .split("\n")
  .map((line) => ({ end: Number(line.slice(8, 15)), text: line.slice(17).trim() }));
const chosen = segments.filter((s) => (part === "tune" ? s.end <= TUNE_UNTIL : part === "held" ? s.end > TUNE_UNTIL : true));
const heardText = chosen.map((s) => s.text).join(" ");
let text = heardText;
for (const [from, to] of FIXES) text = text.replace(from, to);
const sentences = text.match(/[^.?!]+[.?!]+["']?/g)?.map((s) => s.trim()) ?? [];

await ready("en");
const dir = "out/listen-judge/story";
mkdirSync(dir, { recursive: true });
const began = performance.now();
const items = sentences.map((s, i) => ({ file: `${dir}/${String(i).padStart(3, "0")}.wav`, sound: renderScore(speak(s, { lang: "en" }), body, 16000, 0.3) }));
const seconds = items.reduce((sum, i) => sum + i.sound.length / 16000, 0);
console.log(`${sentences.length} sentences, ${seconds.toFixed(0)} s of speech rendered in ${((performance.now() - began) / 1000).toFixed(1)} s; listening...`);
const heard = await listen(items, model, "out/listen-judge");

let right = 0;
let total = 0;
sentences.forEach((s, i) => {
  const want = wordsOf(s);
  const n = understood(want, wordsOf(heard[i]));
  right += n;
  total += want.length;
  if (n < want.length) console.log(`${n}/${want.length}  ${s}\n        -> ${heard[i]}`);
});
const all = wordsOf(text);
const ceiling = understood(all, wordsOf(heardText));
console.log(`\n${part} part, ${bodyName}, ${model}: Orpheon ${right} of ${total} words = ${((100 * right) / total).toFixed(1)}%`);
console.log(`the studio reading of the same words: ${ceiling} of ${all.length} = ${((100 * ceiling) / all.length).toFixed(1)}% (its transcript, so only its slips on names count against it)`);
