// Make sound from the command line: phones (or words) in, a WAV out.
//
//   bun tools/render.ts "h ə ˈl o ʊ" out/hello.wav
//   bun tools/render.ts "ˈa:1.5" out/ah.wav --pitch 220 --body soprano
//   bun tools/render.ts "ˈd o:0.5 ˈɹ e:0.5 ˈm i:0.5" out/tune.wav --pitch "0.3:262,0.8:262,0.85:294,1.3:294,1.35:330"
//   bun tools/render.ts --say "the quick brown fox" out/fox.wav --lang en
//
// Phones are written as tools/voice-score.ts describes. Options:
//   --pitch   Hz, or a tune as seconds:Hz pairs separated by commas (straight lines between)
//   --body    child | soprano | alto | tenor | bass, or tract,folds (e.g. 16,0.6)
//   --rate    sample rate of the file (default 48000)
//   --slow    stretch the usual lengths (default 1)
//   --say     take words instead, through the language layer; --lang picks the language
import { BODIES } from "../src/contract.ts";
import type { Body, Score } from "../src/contract.ts";
import { wav } from "../tests/voice/measure.ts";
import { renderScore, scoreOf } from "./voice-score.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const bodyName = flag("body", "tenor");
const rate = Number(flag("rate", "48000"));
const slow = Number(flag("slow", "1"));
const pitchText = flag("pitch");
const say = flag("say");
const lang = flag("lang", "en");
const [first, second] = args;
const line = say ? "" : first;
const file = say ? first : second;
if (!file || (!say && !line)) {
  console.error('usage: bun tools/render.ts "<phones>" <out.wav> [--pitch hz|t:hz,..] [--body name|tract,folds] [--rate n] [--slow x]');
  console.error('       bun tools/render.ts --say "<words>" <out.wav> [--lang en] [--pitch hz] [--body ..]');
  process.exit(1);
}

const body: Body = bodyName in BODIES
  ? BODIES[bodyName as keyof typeof BODIES]
  : { tract: Number(bodyName.split(",")[0]), folds: Number(bodyName.split(",")[1]) };
const pitch = pitchText.includes(":")
  ? pitchText.split(",").map((pair) => pair.split(":").map(Number) as [number, number])
  : pitchText ? Number(pitchText) : undefined;

let score: Score;
if (say) {
  const language = await import("../src/lang/index.ts");
  await language.ready(lang as never);
  score = language.speak(say, { lang: lang as never, ...(typeof pitch === "number" ? { pitch } : {}) });
} else {
  score = scoreOf(line, { pitch, slow, body });
}
const sound = renderScore(score, body, rate);
await Bun.write(file, wav(sound, rate));
let peak = 0;
for (const v of sound) peak = Math.max(peak, Math.abs(v));
console.log(`${file}: ${(sound.length / rate).toFixed(2)} s, ${score.phones.length} phones, peak ${peak.toFixed(2)}`);
