// What the film's render worker is asked for and answers, and the page's side of asking it: the
// dry sound and the telemetry from the worker, then the room and limiter added by an offline audio
// context, as the WAV export does, so the video sounds as the page did.
import type { RenderJob } from "../audio/messages.ts";
import { buildChain } from "../audio/chain.ts";

export interface FilmJob extends RenderJob {
  fps: number;
  /** Seconds of quiet before every part starts. */
  lead: number;
  /** How many frames the video has; the sound is exactly as long. */
  frames: number;
}

export type FromFilm =
  | { type: "progress"; done: number }
  /** The sound, and for each frame each voice's telemetry then each instrument's, frame after frame. */
  | { type: "done"; left: Float32Array; right: Float32Array; telemetry: Float32Array; instruments: Float32Array }
  | { type: "failed"; why: string };

export interface Rendered {
  /** Left and right, with the room, exactly `frames` frames long. */
  channels: [Float32Array, Float32Array];
  telemetry: Float32Array;
  instruments: Float32Array;
}

export async function renderFilm(job: FilmJob, room: number, onProgress: (done: number) => void, cancelled: () => boolean): Promise<Rendered> {
  const worker = new Worker(new URL("./render-worker.ts", import.meta.url), { type: "module" });
  const dry = await new Promise<Extract<FromFilm, { type: "done" }>>((resolve, reject) => {
    const watch = setInterval(() => cancelled() && reject(new Error("cancelled")), 100);
    worker.onmessage = (event: MessageEvent<FromFilm>) => {
      const m = event.data;
      if (m.type === "progress") return onProgress(m.done);
      clearInterval(watch);
      if (m.type === "done") resolve(m);
      else reject(new Error(m.why));
    };
    worker.onerror = (event) => {
      clearInterval(watch);
      reject(new Error(event.message || "the renderer did not load"));
    };
    worker.postMessage(job);
  }).finally(() => worker.terminate());

  // The room's tail past the end of the video is cut: the video is as long as it is.
  const length = dry.left.length;
  const ctx = new OfflineAudioContext(2, length, job.sampleRate);
  const buffer = ctx.createBuffer(2, length, job.sampleRate);
  buffer.copyToChannel(dry.left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(dry.right as Float32Array<ArrayBuffer>, 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const chain = buildChain(ctx, room, 1);
  source.connect(chain.input);
  chain.output.connect(ctx.destination);
  source.start();
  const done = await ctx.startRendering();
  onProgress(1);
  return { channels: [done.getChannelData(0), done.getChannelData(1)], telemetry: dry.telemetry, instruments: dry.instruments };
}
