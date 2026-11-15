// Frames and sound to a file with WebCodecs: H.264 and AAC in an MP4 where the browser can encode
// both, else VP9 (or VP8) and Opus in a WebM. The frames are drawn one at a time by the caller and
// encoded as they come; nothing waits on the clock, so it runs as fast as the machine can.
import { muxMp4 } from "./mp4.ts";
import type { Sample } from "./mp4.ts";
import { muxWebm } from "./webm.ts";

export type Quality = "light" | "standard" | "high";

/** Bits a second for the picture: a 1080-line frame at 30 fps; 60 fps takes half as much again. */
const MEGABITS: Record<Quality, number> = { light: 5, standard: 10, high: 18 };

export function bitrateFor(width: number, height: number, fps: number, quality: Quality): number {
  const pixels = (width * height) / (1920 * 1080);
  return Math.round(MEGABITS[quality] * 1e6 * pixels * (fps > 30 ? 1.5 : 1));
}

export interface Plan {
  container: "mp4" | "webm";
  video: VideoEncoderConfig;
  audio: AudioEncoderConfig;
}

/** H.264 High profile at the level a 1080-line frame needs at this rate (4.0 at 30 fps, 4.2 at 60). */
const avc = (fps: number) => (fps > 30 ? "avc1.64002A" : "avc1.640028");

/** What this browser can encode, best first. `webm` skips the MP4 (to try the fallback on purpose). */
export async function plan(width: number, height: number, fps: number, bitrate: number, sampleRate: number, webm = false): Promise<Plan> {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") throw new Error("This browser cannot encode video here. A current Chrome or Edge can.");
  const video = (codec: string): VideoEncoderConfig => ({
    codec, width, height, bitrate, framerate: fps, latencyMode: "quality",
    ...(codec.startsWith("avc1") ? { avc: { format: "avc" } } : {}),
  } as VideoEncoderConfig);
  const audio = (codec: string, bits: number): AudioEncoderConfig => ({ codec, sampleRate, numberOfChannels: 2, bitrate: bits });
  const can = async (v: VideoEncoderConfig, a: AudioEncoderConfig) =>
    (await VideoEncoder.isConfigSupported(v).catch(() => ({ supported: false }))).supported &&
    (await AudioEncoder.isConfigSupported(a).catch(() => ({ supported: false }))).supported;
  const tries: Plan[] = [
    ...(webm ? [] : [{ container: "mp4" as const, video: video(avc(fps)), audio: audio("mp4a.40.2", 192_000) }]),
    { container: "webm", video: video(fps > 30 ? "vp09.00.41.08" : "vp09.00.40.08"), audio: audio("opus", 160_000) },
    { container: "webm", video: video("vp8"), audio: audio("opus", 160_000) },
  ];
  for (const t of tries) if (await can(t.video, t.audio)) return t;
  throw new Error("This browser cannot encode H.264, VP9 or VP8 video with sound.");
}

export interface Encoding {
  /** Hand over the next frame (its picture is copied at once). */
  frame(picture: CanvasImageSource, index: number): Promise<void>;
  /** Finish: the file, ready to save. */
  finish(): Promise<{ file: Blob; extension: string }>;
  /** Stop and throw everything away. */
  abandon(): void;
}

/** Start encoding: the sound is encoded straight away, the frames as they are handed over. */
export async function encode(p: Plan, fps: number, sound: { channels: [Float32Array, Float32Array]; sampleRate: number }): Promise<Encoding> {
  let failure: Error | null = null;
  const fail = (error: unknown) => (failure ??= error instanceof Error ? error : new Error(String(error)));
  const frames: Sample[] = [];
  const packets: Sample[] = [];
  let videoConfig: Uint8Array | null = null;
  let audioConfig: Uint8Array | null = null;
  const copy = (chunk: EncodedVideoChunk | EncodedAudioChunk): Uint8Array => {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return data;
  };
  const description = (d: AllowSharedBufferSource | undefined): Uint8Array | null =>
    d ? (ArrayBuffer.isView(d) ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array((d as ArrayBuffer).slice(0))) : null;

  // ── the sound, all at once ──
  const audio = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description) audioConfig ??= description(meta.decoderConfig.description);
      packets.push({ data: copy(chunk), time: chunk.timestamp, duration: chunk.duration ?? 0, key: true });
    },
    error: fail,
  });
  audio.configure(p.audio);
  const [left, right] = sound.channels;
  const BLOCK = 4800;
  for (let at = 0; at < left.length; at += BLOCK) {
    const n = Math.min(BLOCK, left.length - at);
    const planes = new Float32Array(n * 2);
    planes.set(left.subarray(at, at + n), 0);
    planes.set(right.subarray(at, at + n), n);
    const data = new AudioData({ format: "f32-planar", sampleRate: sound.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / sound.sampleRate) * 1e6), data: planes });
    audio.encode(data);
    data.close();
  }
  const audioDone = audio.flush().then(() => audio.close(), fail);

  // ── the picture, frame by frame ──
  const video = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description) videoConfig ??= description(meta.decoderConfig.description);
      frames.push({ data: copy(chunk), time: chunk.timestamp, duration: chunk.duration ?? Math.round(1e6 / fps), key: chunk.type === "key" });
    },
    error: fail,
  });
  video.configure(p.video);
  const tick = 1e6 / fps;

  return {
    async frame(picture, index) {
      if (failure) throw failure;
      const frame = new VideoFrame(picture, { timestamp: Math.round(index * tick), duration: Math.round(tick) });
      // A keyframe every two seconds, so a player can seek.
      video.encode(frame, { keyFrame: index % (fps * 2) === 0 });
      frame.close();
      // Don't run ahead of the encoder: frames waiting in its queue are whole pictures in memory.
      while (video.encodeQueueSize > 6 && !failure) await new Promise((done) => video.addEventListener("dequeue", done, { once: true }));
    },
    async finish() {
      await video.flush();
      video.close();
      await audioDone;
      if (failure) throw failure;
      const [width, height] = [p.video.width, p.video.height];
      // Sound packets past the end of the picture (the encoder's own delay) are left out.
      const end = frames.length * tick;
      const heard = packets.filter((s) => s.time < end);
      if (p.container === "mp4") {
        if (!videoConfig) throw new Error("the video encoder gave no H.264 configuration");
        const parts = muxMp4({ width, height, fps, avcc: videoConfig, samples: frames }, { sampleRate: sound.sampleRate, channels: 2, config: audioConfig, samples: heard });
        return { file: new Blob(parts as BlobPart[], { type: "video/mp4" }), extension: "mp4" };
      }
      const codec = p.video.codec.startsWith("vp8") ? "V_VP8" : "V_VP9";
      const parts = muxWebm({ codec, width, height, samples: frames }, { sampleRate: sound.sampleRate, channels: 2, head: audioConfig, samples: heard });
      return { file: new Blob(parts as BlobPart[], { type: "video/webm" }), extension: "webm" };
    },
    abandon() {
      for (const coder of [video, audio]) if (coder.state !== "closed") coder.close();
    },
  };
}
