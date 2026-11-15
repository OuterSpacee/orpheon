// A performance to a WAV file: the voices render in a Worker, faster than real time; the room
// and the limiter are added by an offline audio context, so the file sounds like the page did.
import { buildChain } from "./chain.ts";
import type { Score } from "../../contract.ts";
import type { FromRender, RenderJob, VowelJob } from "./messages.ts";
import { ROOM } from "./room.ts";
import { encodeWav } from "./wav.ts";

export interface Rendered {
  wav: Blob;
  /** Length of the file in seconds. */
  seconds: number;
  /** Loudest sample in it, 0..1. */
  peak: number;
  /** How long the rendering took, in seconds. */
  took: number;
}

/** Ask the worker one thing and wait for its answer of the kind wanted. */
function ask<K extends FromRender["type"]>(job: RenderJob | VowelJob, want: K, onProgress: (done: number) => void = () => {}) {
  const worker = new Worker(new URL("./render-worker.ts", import.meta.url), { type: "module" });
  return new Promise<Extract<FromRender, { type: K }>>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<FromRender>) => {
      const m = event.data;
      if (m.type === "progress") onProgress(m.done);
      else if (m.type === want) resolve(m as Extract<FromRender, { type: K }>);
      else reject(new Error(m.type === "failed" ? m.why : "the renderer answered something else"));
    };
    worker.onerror = (event) => reject(new Error(event.message || "the renderer did not load"));
    worker.postMessage(job);
  }).finally(() => worker.terminate());
}

/** How the engine forms each of these vowels: POSE_COUNT floats for each, in pose order. */
export async function probeVowels(vowels: Score[]): Promise<Float32Array> {
  return (await ask({ vowels }, "vowels")).poses;
}

export async function renderWav(job: RenderJob, room: number, onProgress: (done: number) => void = () => {}): Promise<Rendered> {
  const began = performance.now();
  const dry = await ask(job, "done", (done) => onProgress(done * 0.9));
  const frames = dry.left.length + Math.ceil(ROOM.decay * job.sampleRate);
  const ctx = new OfflineAudioContext(2, frames, job.sampleRate);
  const buffer = ctx.createBuffer(2, dry.left.length, job.sampleRate);
  buffer.copyToChannel(dry.left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(dry.right as Float32Array<ArrayBuffer>, 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const chain = buildChain(ctx, room, 1);
  source.connect(chain.input);
  chain.output.connect(ctx.destination);
  source.start();
  const finished = await ctx.startRendering();
  const channels = [finished.getChannelData(0), finished.getChannelData(1)];
  let peak = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  onProgress(1);
  return {
    wav: new Blob([encodeWav(channels, job.sampleRate)], { type: "audio/wav" }),
    seconds: frames / job.sampleRate,
    peak,
    took: (performance.now() - began) / 1000,
  };
}

/** Hand a file to the browser to save. */
export function save(file: Blob, name: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

/** "Joyful, joyful!" to "joyful-joyful": something safe to call a file. */
export function fileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `orpheon-${slug || "voice"}.wav`;
}
