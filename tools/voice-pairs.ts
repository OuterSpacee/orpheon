// The pairs test: which consonants can a listener tell apart? Words that differ by one sound
// (sea / she, no / low, wet / let), each after the same carrier, "Here is the word. ___.", so the
// listener gets a sentence but no hint about the word (the Modified Rhyme Test's idea: House,
// Williams, Hecker & Kryter 1965, "Articulation-testing methods: consonantal differentiation with
// a closed-response set", JASA 37). Whisper is the listener.
//
// The first carrier, "Please say ___ again.", was heard as "PC ___" and the word stuck to it
// ("pccl", "pc9"), so a fault in "say" counted against every consonant. This one is said cleanly,
// and the full stop keeps the word apart.
//
//   bun tools/voice-pairs.ts                    every contrast, the tenor
//   bun tools/voice-pairs.ts --only "r / l"     one contrast
//   bun tools/voice-pairs.ts --body alto --model medium.en
//
// For each contrast it prints how often each word came back as itself, and what the misses were
// heard as. Change the voice, not these lists, to raise it.
import { BODIES } from "../src/contract.ts";
import type { Body } from "../src/contract.ts";
import { ready, speak } from "../src/lang/index.ts";
import { renderScore } from "./voice-score.ts";
import { listen, wordsOf } from "./listener.ts";
import { mkdirSync } from "node:fs";

const CONTRASTS: [string, [string, string][]][] = [
  ["s / sh", [["sea", "she"], ["sip", "ship"], ["sell", "shell"], ["sort", "short"], ["mass", "mash"], ["so", "show"]]],
  ["n / l", [["no", "low"], ["night", "light"], ["net", "let"], ["nine", "line"], ["knock", "lock"]]],
  ["r / l", [["rip", "lip"], ["right", "light"], ["rock", "lock"], ["red", "led"], ["row", "low"]]],
  ["w / r", [["wait", "rate"], ["wing", "ring"], ["way", "ray"], ["west", "rest"], ["wipe", "ripe"]]],
  ["w / l", [["wake", "lake"], ["wit", "lit"], ["way", "lay"], ["wet", "let"], ["wine", "line"]]],
  ["m / n", [["map", "nap"], ["mail", "nail"], ["might", "night"], ["mine", "nine"], ["met", "net"]]],
  ["z / d", [["zip", "dip"], ["zeal", "deal"], ["zoom", "doom"], ["zing", "ding"]]],
  ["f / th", [["fin", "thin"], ["free", "three"], ["fought", "thought"], ["first", "thirst"]]],
  ["p / b", [["pat", "bat"], ["pie", "buy"], ["pin", "bin"], ["pole", "bowl"]]],
  ["t / d", [["tie", "die"], ["tip", "dip"], ["ten", "den"], ["time", "dime"]]],
  ["k / g", [["coat", "goat"], ["cap", "gap"], ["cold", "gold"], ["come", "gum"]]],
  ["j / d", [["jump", "dump"], ["jet", "debt"], ["jog", "dog"], ["jab", "dab"]]],
];

/** Spellings that sound the same: hearing any of them is hearing the word. */
const SAME: Record<string, string[]> = {
  sea: ["see"], so: ["sew", "sow"], sell: ["cell"], sort: ["sought"], right: ["write", "rite"], night: ["knight"],
  no: ["know"], row: ["roe"], red: ["read"], led: ["lead"], ring: ["wring"], wait: ["weight"], way: ["weigh", "whey"],
  rest: ["wrest"], wine: ["whine"], mail: ["male"], might: ["mite"], lay: ["lei"], wet: ["whet"], wit: ["whit"],
  pie: ["pi"], buy: ["by", "bye"], pole: ["poll"], tie: ["thai"], die: ["dye"], time: ["thyme"], knock: ["nock"],
  coat: ["cote"], low: ["lo"], nine: ["9"], ten: ["10"], fin: ["finn"], lock: ["loch"],
};
const forms = (w: string) => [w, ...(SAME[w] ?? [])];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = flag("only", "");
const bodyName = flag("body", "tenor");
const model = flag("model", "small.en");
const body: Body = BODIES[bodyName as keyof typeof BODIES];
/** A folder of recordings to judge instead of Orpheon: 000.wav... (16 kHz mono), one per word in the order of every contrast, a pair's first word first. */
const clips = flag("clips", "");
const chosen = CONTRASTS.filter(([name]) => !only || name === only);

await ready("en");
const dir = "out/listen-judge/pairs";
mkdirSync(dir, { recursive: true });
const asked: { contrast: string; word: string; rival: string; n: number }[] = [];
let n = 0;
for (const [contrast, pairs] of CONTRASTS)
  for (const [a, b] of pairs) {
    if (chosen.some(([name]) => name === contrast)) asked.push({ contrast, word: a, rival: b, n }, { contrast, word: b, rival: a, n: n + 1 });
    n += 2;
  }
const items = asked.map((q, i) =>
  clips
    ? { file: `${clips}/${String(q.n).padStart(3, "0")}.wav` }
    : { file: `${dir}/${String(i).padStart(3, "0")}.wav`, sound: renderScore(speak(`Here is the word. ${q.word}.`, { lang: "en" }), body, 16000, 0.3) },
);
console.log(`${items.length} words in the carrier sentence${clips ? `, recorded in ${clips}` : ""}; listening...`);
const heard = await listen(items, model, "out/listen-judge");

/** The words after "word", or everything but the carrier when it was not heard. */
function slot(text: string): string[] {
  const w = wordsOf(text);
  const from = w.indexOf("word");
  if (from >= 0) return w.slice(from + 1);
  return w.filter((x) => !["here", "is", "the", "word"].includes(x));
}

let right = 0;
for (const [contrast] of chosen) {
  const rows = asked.map((q, i) => ({ ...q, got: slot(heard[i]) })).filter((r) => r.contrast === contrast);
  const ok = rows.filter((r) => forms(r.word).some((f) => r.got.includes(f)) && !forms(r.rival).some((f) => r.got.includes(f)));
  right += ok.length;
  const misses = rows.filter((r) => !ok.includes(r)).map((r) => `${r.word} -> ${r.got.join(" ") || "(nothing)"}${forms(r.rival).some((f) => r.got.includes(f)) ? " (its pair)" : ""}`);
  console.log(`${contrast.padEnd(7)} ${String(ok.length).padStart(2)}/${rows.length}  ${misses.join(", ")}`);
}
console.log(`\n${clips || bodyName}, ${model}: ${right} of ${asked.length} words heard as themselves = ${((100 * right) / asked.length).toFixed(1)}%`);
