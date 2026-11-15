// How fast is a voice? The page runs up to six at once in one audio thread, so each must render
// at least ten times faster than real time.
//
//   bun tools/voice-bench.ts            every body in BODIES at 48 kHz, in blocks of 128 as a worklet does
//   bun tools/voice-bench.ts --rate 44100
//
// A smaller body costs more: its tube is shorter, so the simulation's own rate is higher.
import { BODIES } from "../src/contract.ts";
import type { Body } from "../src/contract.ts";
import { createVoice } from "../src/voice/index.ts";
import { scoreOf } from "./voice-score.ts";

const at = process.argv.indexOf("--rate");
const rate = at > 0 ? Number(process.argv[at + 1]) : 48000;
const LINE = "ˈs i ŋ | ə | ˈs ɔː ŋ | ə v | ˈs ɪ k s | ˈp ɛ n s _:0.3 ˈh a ʊ | ˈm ɛ n i | ˈb ɹ aː v | ˈʃ ɪ p s | k ə n | ˈj uː | ˈk a ʊ n t _:0.3";
const SECONDS = 20;

function time(body: Body): number {
  const voice = createVoice(rate, body);
  const score = scoreOf(LINE, { body });
  const block = new Float32Array(128);
  const blocks = Math.ceil((SECONDS * rate) / 128);
  let next = 0;
  const began = performance.now();
  for (let i = 0; i < blocks; i++) {
    // Say the line over and over.
    if (voice.time >= next) {
      voice.perform(score, next);
      next += score.length;
    }
    voice.render(block);
  }
  return (blocks * 128) / rate / ((performance.now() - began) / 1000);
}

time(BODIES.tenor); // warm up
let slowest = Infinity;
for (const [name, body] of Object.entries(BODIES)) {
  const speed = Math.max(time(body), time(body));
  slowest = Math.min(slowest, speed);
  console.log(`${name.padEnd(8)} tract ${String(body.tract).padEnd(5)} ${speed.toFixed(1)}x real time at ${rate} Hz`);
}
console.log(`slowest ${slowest.toFixed(1)}x; six of the slowest together ${(slowest / 6).toFixed(1)}x`);
