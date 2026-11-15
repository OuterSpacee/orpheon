// An MP4 file around H.264 video and AAC sound, as WebCodecs encodes them (ISO/IEC 14496-12, the
// base media file format; 14496-15 for avcC, 14496-14 and 14496-3 for esds and the AAC config).
//
// Everything is known before the file is written, so the index (moov) goes in front of the
// frames (mdat): a player can start while the file is still arriving. The frames are laid out a
// second of video then a second of sound at a time, so a player reading from the front never has
// to jump far ahead for the sound.
import { flatten, measure, pack } from "./bytes.ts";
import type { Piece, Tree } from "./bytes.ts";

/** One encoded frame of video or packet of sound. */
export interface Sample {
  data: Uint8Array;
  /** When it is shown or heard, in microseconds from the start. */
  time: number;
  /** How long it lasts, in microseconds. */
  duration: number;
  /** Can be decoded alone (a video keyframe; every sound packet is). */
  key: boolean;
}

export interface VideoTrack {
  width: number;
  height: number;
  fps: number;
  /** The avcC record the encoder gave (decoderConfig.description). */
  avcc: Uint8Array;
  samples: Sample[];
}

export interface AudioTrack {
  sampleRate: number;
  channels: number;
  /** The AudioSpecificConfig the encoder gave, or null to write the plain AAC-LC one. */
  config: Uint8Array | null;
  samples: Sample[];
}

/** Ticks per second of the video track: whole ticks for a frame at 24, 25, 30, 50 and 60 fps. */
export const VIDEO_TIMESCALE = 90000;

function box(type: string, ...kids: Piece[]): Tree {
  return { head: (n) => pack((w) => w.u32(n + 8).text(type)), kids };
}

function full(type: string, version: number, flags: number, ...kids: Piece[]): Tree {
  return box(type, pack((w) => w.u8(version).u24(flags)), ...kids);
}

const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

/** Runs of equal values, as [count, value] pairs (stts, ctts, stsc are written this way). */
export function runs(values: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

/** AAC-LC at this rate and channel count (14496-3, 1.6.2.1). */
export function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const index = Math.max(0, rates.indexOf(sampleRate));
  return new Uint8Array([(2 << 3) | (index >> 1), ((index & 1) << 7) | (channels << 3)]);
}

/** An MPEG-4 descriptor: a tag, its length, its body. */
function descriptor(tag: number, body: Uint8Array): Uint8Array {
  // The length in the four-byte form every reader accepts.
  const n = body.length;
  return pack((w) => w.u8(tag).u8(0x80 | ((n >> 21) & 0x7f)).u8(0x80 | ((n >> 14) & 0x7f)).u8(0x80 | ((n >> 7) & 0x7f)).u8(n & 0x7f).bytes(body));
}

interface Laid {
  /** Each chunk: which track, its first sample, how many. */
  chunks: { track: 0 | 1; first: number; count: number }[];
  /** Bytes from the start of the frames to each chunk. */
  at: number[];
  size: number;
}

/** A second of video, then a second of sound, and so on. */
function interleave(tracks: Sample[][]): Laid {
  const chunks: Laid["chunks"] = [];
  const at: number[] = [];
  const next = [0, 0];
  let size = 0;
  for (let second = 1; next.some((n, t) => n < tracks[t].length); second++) {
    for (const t of [0, 1] as const) {
      const samples = tracks[t];
      const first = next[t];
      while (next[t] < samples.length && samples[next[t]].time < second * 1e6) next[t]++;
      const count = next[t] - first;
      if (!count) continue;
      chunks.push({ track: t, first, count });
      at.push(size);
      for (let i = first; i < next[t]; i++) size += samples[i].data.length;
    }
  }
  return { chunks, at, size };
}

/** The file, as a list of byte arrays in order (for a Blob). */
export function muxMp4(video: VideoTrack, audio: AudioTrack | null): Uint8Array[] {
  const tracks = [video.samples, audio?.samples ?? []];
  const laid = interleave(tracks);
  const tick = Math.round(VIDEO_TIMESCALE / video.fps);
  const videoTicks = video.samples.length * tick;
  const audioTicks = audio ? audio.samples.reduce((n, s) => n + Math.round((s.duration * audio.sampleRate) / 1e6), 0) : 0;
  const seconds = Math.max(videoTicks / VIDEO_TIMESCALE, audio ? audioTicks / audio.sampleRate : 0);

  const ftyp = box("ftyp", pack((w) => w.text("isom").u32(512).text("isom").text("iso2").text("avc1").text("mp41")));
  // The offsets are only known once the index is measured; its size does not depend on them, as
  // long as the kind of offset table (32 or 64 bits) is fixed first.
  const wide = laid.size + 4_000_000 + video.samples.length * 64 > 0xffffffff;
  const build = (start: number) =>
    box(
      "moov",
      full("mvhd", 0, 0, pack((w) => {
        w.u32(0).u32(0).u32(1000).u32(Math.round(seconds * 1000));
        w.u32(0x10000).u16(0x100).zeros(10);
        for (const m of MATRIX) w.u32(m);
        w.zeros(24).u32(audio ? 3 : 2);
      })),
      videoTrak(video, tick, laid, start, wide),
      ...(audio ? [audioTrak(audio, laid, start, wide)] : []),
    );
  const head = measure(ftyp) + measure(build(0)) + 8;
  const moov = build(head);
  const mdat = pack((w) => w.u32(laid.size + 8).text("mdat"));
  const out = flatten(ftyp);
  flatten(moov, out);
  out.push(mdat);
  for (const chunk of laid.chunks) {
    const samples = tracks[chunk.track];
    for (let i = chunk.first; i < chunk.first + chunk.count; i++) out.push(samples[i].data);
  }
  return out;
}

function tkhd(id: number, ticksInMovie: number, audio: boolean, width: number, height: number): Tree {
  return full("tkhd", 0, 3, pack((w) => {
    w.u32(0).u32(0).u32(id).u32(0).u32(ticksInMovie).zeros(8);
    w.u16(0).u16(0).u16(audio ? 0x100 : 0).u16(0);
    for (const m of MATRIX) w.u32(m);
    w.u32(width * 0x10000).u32(height * 0x10000);
  }));
}

function mdhd(timescale: number, duration: number): Tree {
  // Language "und", packed as three five-bit letters.
  return full("mdhd", 0, 0, pack((w) => w.u32(0).u32(0).u32(timescale).u32(duration).u16(0x55c4).u16(0)));
}

function hdlr(type: string, name: string): Tree {
  return full("hdlr", 0, 0, pack((w) => w.u32(0).text(type).zeros(12).text(name).u8(0)));
}

const dinf = () => box("dinf", full("dref", 0, 0, pack((w) => w.u32(1)), full("url ", 0, 1)));

/** Where each chunk of a track starts in the file, and how many samples each holds. */
function chunkTables(track: 0 | 1, laid: Laid, start: number, wide: boolean): Tree[] {
  const mine = laid.chunks.map((c, i) => ({ ...c, offset: start + laid.at[i] })).filter((c) => c.track === track);
  // stsc: a new entry only where the count per chunk changes.
  const stsc: [number, number][] = [];
  mine.forEach((c, i) => {
    if (!stsc.length || stsc[stsc.length - 1][1] !== c.count) stsc.push([i + 1, c.count]);
  });
  return [
    full("stsc", 0, 0, pack((w) => {
      w.u32(stsc.length);
      for (const [first, count] of stsc) w.u32(first).u32(count).u32(1);
    })),
    wide
      ? full("co64", 0, 0, pack((w) => {
          w.u32(mine.length);
          for (const c of mine) w.u64(c.offset);
        }))
      : full("stco", 0, 0, pack((w) => {
          w.u32(mine.length);
          for (const c of mine) w.u32(c.offset);
        })),
  ];
}

function stsz(samples: Sample[]): Tree {
  return full("stsz", 0, 0, pack((w) => {
    w.u32(0).u32(samples.length);
    for (const s of samples) w.u32(s.data.length);
  }));
}

function stts(durations: number[]): Tree {
  const r = runs(durations);
  return full("stts", 0, 0, pack((w) => {
    w.u32(r.length);
    for (const [count, delta] of r) w.u32(count).u32(delta);
  }));
}

function videoTrak(v: VideoTrack, tick: number, laid: Laid, start: number, wide: boolean): Tree {
  const n = v.samples.length;
  const ticks = n * tick;
  // Frames are stored in the order they decode; a frame shown later than it decodes (none, unless
  // the encoder used B-frames) carries the difference in ctts.
  const offsets = v.samples.map((s, i) => Math.round((s.time * VIDEO_TIMESCALE) / 1e6) - i * tick);
  const reordered = offsets.some((o) => o !== 0);
  const keys = v.samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const entry = box(
    "avc1",
    pack((w) => {
      w.zeros(6).u16(1).u16(0).u16(0).zeros(12);
      w.u16(v.width).u16(v.height).u32(0x480000).u32(0x480000).u32(0).u16(1);
      const name = "Orpheon";
      w.u8(name.length).text(name).zeros(31 - name.length);
      w.u16(0x18).i16(-1);
    }),
    box("avcC", v.avcc),
    box("pasp", pack((w) => w.u32(1).u32(1))),
  );
  return box(
    "trak",
    tkhd(1, Math.round((ticks / VIDEO_TIMESCALE) * 1000), false, v.width, v.height),
    box(
      "mdia",
      mdhd(VIDEO_TIMESCALE, ticks),
      hdlr("vide", "Orpheon video"),
      box(
        "minf",
        full("vmhd", 0, 1, pack((w) => w.zeros(8))),
        dinf(),
        box(
          "stbl",
          full("stsd", 0, 0, pack((w) => w.u32(1)), entry),
          stts(new Array(n).fill(tick)),
          ...(keys.length < n
            ? [full("stss", 0, 0, pack((w) => {
                w.u32(keys.length);
                for (const k of keys) w.u32(k);
              }))]
            : []),
          ...(reordered
            ? [full("ctts", 1, 0, pack((w) => {
                const r = runs(offsets);
                w.u32(r.length);
                for (const [count, offset] of r) w.u32(count).i32(offset);
              }))]
            : []),
          ...chunkTables(0, laid, start, wide).slice(0, 1),
          stsz(v.samples),
          ...chunkTables(0, laid, start, wide).slice(1),
        ),
      ),
    ),
  );
}

function audioTrak(a: AudioTrack, laid: Laid, start: number, wide: boolean): Tree {
  const durations = a.samples.map((s) => Math.round((s.duration * a.sampleRate) / 1e6));
  const ticks = durations.reduce((x, y) => x + y, 0);
  const bitrate = Math.round((a.samples.reduce((n, s) => n + s.data.length, 0) * 8) / Math.max(0.001, ticks / a.sampleRate));
  const config = a.config ?? aacConfig(a.sampleRate, a.channels);
  const decoder = descriptor(0x04, pack((w) => w.u8(0x40).u8(0x15).u24(0).u32(bitrate).u32(bitrate).bytes(descriptor(0x05, config))));
  const es = descriptor(0x03, pack((w) => w.u16(0).u8(0).bytes(decoder).bytes(descriptor(0x06, new Uint8Array([2])))));
  const entry = box(
    "mp4a",
    pack((w) => w.zeros(6).u16(1).zeros(8).u16(a.channels).u16(16).u16(0).u16(0).u32(a.sampleRate * 0x10000)),
    full("esds", 0, 0, es),
  );
  return box(
    "trak",
    tkhd(2, Math.round((ticks / a.sampleRate) * 1000), true, 0, 0),
    box(
      "mdia",
      mdhd(a.sampleRate, ticks),
      hdlr("soun", "Orpheon sound"),
      box(
        "minf",
        full("smhd", 0, 0, pack((w) => w.u16(0).u16(0))),
        dinf(),
        box(
          "stbl",
          full("stsd", 0, 0, pack((w) => w.u32(1)), entry),
          stts(durations),
          ...chunkTables(1, laid, start, wide).slice(0, 1),
          stsz(a.samples),
          ...chunkTables(1, laid, start, wide).slice(1),
        ),
      ),
    ),
  );
}
