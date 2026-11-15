// Renders a performance to samples away from the page, as fast as the machine can, with the same
// voices and the same mixer the live sound uses. The page adds the room afterwards (export.ts).
import { POSE_COUNT, TELEMETRY, TELEMETRY_SIZE } from "../../contract.ts";
import { createInstrument } from "../../band/index.ts";
import { createVoice } from "../../voice/index.ts";
import { Band } from "./band.ts";
import { Choir } from "./choir.ts";
import type { FromRender, RenderJob, VowelJob } from "./messages.ts";

/** Silence before the first score starts, so the mixer's fade-in is over when the sound begins. */
const LEAD = 0.05;
const BLOCK = 2048;
/** The rate the vowels are asked at; a mouth's pose does not depend on it. */
const PROBE_RATE = 24000;

/** Perform each vowel alone and read the pose the voice says it took. */
function probe(job: VowelJob): Float32Array {
  const poses = new Float32Array(job.vowels.length * POSE_COUNT);
  const sensed = new Float32Array(TELEMETRY_SIZE);
  const block = new Float32Array(BLOCK);
  job.vowels.forEach((score, i) => {
    const voice = createVoice(PROBE_RATE);
    voice.perform(score);
    // To the middle of the vowel, where the mouth has arrived.
    const phone = score.phones[0];
    const until = phone ? phone.t + phone.d * 0.7 : score.length;
    while (voice.time < until) voice.render(block);
    voice.sense(sensed);
    poses.set(sensed.subarray(TELEMETRY.pose, TELEMETRY.pose + POSE_COUNT), i * POSE_COUNT);
  });
  return poses;
}

self.onmessage = (event: MessageEvent<RenderJob | VowelJob>) => {
  const say = (message: FromRender, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
  try {
    if ("vowels" in event.data) return say({ type: "vowels", poses: probe(event.data) });
    const job = event.data;
    const choir = new Choir(job.sampleRate, createVoice);
    let seconds = 0;
    job.parts.forEach((part, seat) => {
      choir.add(seat, part.body, part.level, part.place);
      choir.perform(seat, part.score, LEAD);
      seconds = Math.max(seconds, part.score.length);
    });
    // The band starts on the same sample as the voices, as it does live.
    const band = new Band(job.sampleRate, createInstrument);
    band.level(job.bandLevel ?? 0.8, true);
    (job.band ?? []).forEach((part, slot) => {
      band.add(slot, part.instrument, part.level, part.place);
      band.perform(slot, part.notes, LEAD);
      for (const n of part.notes) seconds = Math.max(seconds, n.t + n.d);
    });
    const frames = Math.ceil((LEAD + seconds + job.tail) * job.sampleRate);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    const blockLeft = new Float32Array(BLOCK);
    const blockRight = new Float32Array(BLOCK);
    for (let at = 0, block = 0; at < frames; at += BLOCK, block++) {
      const n = Math.min(BLOCK, frames - at);
      const l = n === BLOCK ? blockLeft : new Float32Array(n);
      const r = n === BLOCK ? blockRight : new Float32Array(n);
      choir.render(l, r);
      band.render(l, r);
      left.set(l, at);
      right.set(r, at);
      if (block % 24 === 0) say({ type: "progress", done: at / frames });
    }
    if (choir.faults) throw new Error("the voice produced samples that were not numbers");
    if (band.faults) throw new Error("an instrument produced samples that were not numbers");
    say({ type: "done", left, right }, [left.buffer, right.buffer]);
  } catch (error) {
    say({ type: "failed", why: error instanceof Error ? error.message : String(error) });
  }
};
