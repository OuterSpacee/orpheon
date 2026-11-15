// The muxers: write a file from made-up samples, read it back with a reader written here from the
// specifications, and check that every frame is where the index says, as long as it says.
import { expect, test } from "bun:test";
import { join } from "../../src/app/film/bytes.ts";
import { VIDEO_TIMESCALE, aacConfig, muxMp4, runs } from "../../src/app/film/mp4.ts";
import type { Sample } from "../../src/app/film/mp4.ts";
import { ID, muxWebm, opusHead, vint } from "../../src/app/film/webm.ts";

/** Samples whose bytes say which they are, so a misplaced one is caught. */
function samples(count: number, every: number, size: (i: number) => number, key: (i: number) => boolean, tag: number): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const data = new Uint8Array(size(i));
    for (let k = 0; k < data.length; k++) data[k] = (tag + i * 7 + k) & 0xff;
    return { data, time: Math.round(i * every), duration: Math.round(every), key: key(i) };
  });
}

// ── reading an MP4 back ──

interface Box {
  type: string;
  start: number;
  size: number;
  body: DataView;
  kids: Box[];
}
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts"]);

function boxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  for (let at = from; at < to; ) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    expect(size).toBeGreaterThanOrEqual(8);
    expect(at + size).toBeLessThanOrEqual(to);
    const box: Box = { type, start: at, size, body: new DataView(bytes.buffer, bytes.byteOffset + at + 8, size - 8), kids: [] };
    if (CONTAINERS.has(type)) box.kids = boxes(bytes, at + 8, at + size);
    out.push(box);
    at += size;
  }
  return out;
}
const find = (list: Box[], path: string): Box => {
  let here: Box | undefined;
  let kids = list;
  for (const type of path.split("/")) {
    here = kids.find((b) => b.type === type);
    if (!here) throw new Error(`no ${path}`);
    kids = here.kids;
  }
  return here!;
};
/** A full box's entries after version, flags and count. */
function table(box: Box, width: number): number[][] {
  const n = box.body.getUint32(4);
  return Array.from({ length: n }, (_, i) => Array.from({ length: width }, (_, k) => box.body.getUint32(8 + (i * width + k) * 4)));
}
function expand(entries: number[][]): number[] {
  return entries.flatMap(([count, value]) => new Array(count).fill(value));
}
/** Where each sample of a track starts in the file, from stsc, stco and stsz. */
function placesOf(stbl: Box[]): { at: number[]; sizes: number[] } {
  const stsz = find(stbl, "stsz");
  const n = stsz.body.getUint32(8);
  const sizes = Array.from({ length: n }, (_, i) => stsz.body.getUint32(12 + i * 4));
  const stco = table(find(stbl, "stco"), 1).map((r) => r[0]);
  const stsc = table(find(stbl, "stsc"), 3);
  const at: number[] = [];
  let sample = 0;
  stco.forEach((offset, c) => {
    const entry = [...stsc].reverse().find((e) => e[0] <= c + 1)!;
    let p = offset;
    for (let k = 0; k < entry[1]; k++) {
      at.push(p);
      p += sizes[sample++];
    }
  });
  return { at, sizes };
}

test("runs of equal values", () => {
  expect(runs([3, 3, 3, 4, 3])).toEqual([[3, 3], [1, 4], [1, 3]]);
  expect(runs([])).toEqual([]);
});

test("the AAC config for 48 kHz stereo is the usual 0x11 0x90", () => {
  expect([...aacConfig(48000, 2)]).toEqual([0x11, 0x90]);
  expect([...aacConfig(44100, 2)]).toEqual([0x12, 0x10]);
});

test("an MP4 reads back: the index in front, every sample where it says, the right lengths", () => {
  const fps = 30;
  const video = samples(95, 1e6 / fps, (i) => 300 + ((i * 37) % 200), (i) => i % 60 === 0, 1);
  const audio = samples(150, (1024 / 48000) * 1e6, (i) => 100 + (i % 9), () => true, 99);
  const avcc = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xee]);
  const file = join(muxMp4({ width: 1080, height: 1920, fps, avcc, samples: video }, { sampleRate: 48000, channels: 2, config: null, samples: audio }));
  const top = boxes(file, 0, file.length);
  expect(top.map((b) => b.type)).toEqual(["ftyp", "moov", "mdat"]);
  const mdat = top[2];
  expect(mdat.start + mdat.size).toBe(file.length);

  // The movie lasts as long as its longer track: here the sound, 150 packets of 1024.
  const mvhd = find(top, "moov/mvhd");
  expect(mvhd.body.getUint32(12)).toBe(1000);
  expect(mvhd.body.getUint32(16)).toBe(Math.round(Math.max(95 / 30, (150 * 1024) / 48000) * 1000));

  const traks = find(top, "moov").kids.filter((b) => b.type === "trak");
  expect(traks.length).toBe(2);
  const [v, a] = traks.map((t) => find(t.kids, "mdia/minf/stbl").kids);

  // Video: its size in tkhd and the sample entry, one tick per frame, keyframes listed.
  const tkhd = find(traks[0].kids, "tkhd");
  expect(tkhd.body.getUint32(4 + 72) / 65536).toBe(1080);
  expect(tkhd.body.getUint32(4 + 76) / 65536).toBe(1920);
  expect(find(traks[0].kids, "mdia/mdhd").body.getUint32(12)).toBe(VIDEO_TIMESCALE);
  expect(find(traks[0].kids, "mdia/mdhd").body.getUint32(16)).toBe(95 * (VIDEO_TIMESCALE / 30));
  expect(expand(table(find(v, "stts"), 2))).toEqual(new Array(95).fill(VIDEO_TIMESCALE / 30));
  expect(table(find(v, "stss"), 1).map((r) => r[0])).toEqual([1, 61]);
  const stsd = find(v, "stsd");
  expect(String.fromCharCode(...new Uint8Array(stsd.body.buffer, stsd.body.byteOffset + 12, 4))).toBe("avc1");
  expect(stsd.body.getUint16(8 + 8 + 24)).toBe(1080);
  expect(stsd.body.getUint16(8 + 8 + 26)).toBe(1920);

  // Sound: 1024 samples a packet at 48 kHz.
  expect(find(traks[1].kids, "mdia/mdhd").body.getUint32(12)).toBe(48000);
  expect(expand(table(find(a, "stts"), 2))).toEqual(new Array(150).fill(1024));
  const esds = new Uint8Array(find(a, "stsd").body.buffer, find(a, "stsd").body.byteOffset, find(a, "stsd").body.byteLength);
  const hasConfig = esds.findIndex((_, i) => esds[i] === 0x05 && esds[i + 4] === 2 && esds[i + 5] === 0x11 && esds[i + 6] === 0x90);
  expect(hasConfig).toBeGreaterThan(0);

  // Every sample of both tracks is at the place the index gives, with its own bytes, inside mdat.
  for (const [stbl, written] of [[v, video], [a, audio]] as const) {
    const { at, sizes } = placesOf(stbl);
    expect(at.length).toBe(written.length);
    written.forEach((s, i) => {
      expect(sizes[i]).toBe(s.data.length);
      expect(at[i]).toBeGreaterThanOrEqual(mdat.start + 8);
      expect(file.subarray(at[i], at[i] + sizes[i])).toEqual(s.data);
    });
  }
  // Interleaved: a chunk of video, then of sound, and more than one of each.
  expect(table(find(v, "stco"), 1).length).toBeGreaterThan(1);
  expect(table(find(a, "stco"), 1).length).toBeGreaterThan(1);
  expect(table(find(a, "stco"), 1)[0][0]).toBeGreaterThan(table(find(v, "stco"), 1)[0][0]);
});

test("an MP4 of video alone, all keyframes, has no sync table and one track", () => {
  const video = samples(10, 1e6 / 60, () => 50, () => true, 3);
  const file = join(muxMp4({ width: 64, height: 64, fps: 60, avcc: new Uint8Array([1, 2, 3]), samples: video }, null));
  const top = boxes(file, 0, file.length);
  expect(find(top, "moov").kids.filter((b) => b.type === "trak").length).toBe(1);
  const stbl = find(top, "moov/trak/mdia/minf/stbl").kids;
  expect(stbl.some((b) => b.type === "stss")).toBe(false);
  expect(stbl.some((b) => b.type === "ctts")).toBe(false);
  expect(expand(table(find(stbl, "stts"), 2))).toEqual(new Array(10).fill(1500));
});

// ── reading a WebM back ──

interface Element {
  id: number;
  start: number;
  /** Where its content starts and ends. */
  from: number;
  to: number;
  kids: Element[];
}
const MASTERS = new Set<number>([ID.Segment, ID.SeekHead, ID.Seek, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Audio, ID.Cluster, ID.Cues, ID.CuePoint, ID.CueTrackPositions, ID.EBML]);

function readVint(bytes: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number } {
  const first = bytes[at];
  let n = 1;
  while (n <= 8 && !(first & (0x100 >> n))) n++;
  let value = keepMarker ? first : first & ((0x100 >> n) - 1);
  for (let i = 1; i < n; i++) value = value * 256 + bytes[at + i];
  return { value, length: n };
}

function elements(bytes: Uint8Array, from: number, to: number): Element[] {
  const out: Element[] = [];
  for (let at = from; at < to; ) {
    const id = readVint(bytes, at, true);
    const size = readVint(bytes, at + id.length, false);
    const start = at + id.length + size.length;
    expect(start + size.value).toBeLessThanOrEqual(to);
    const e: Element = { id: id.value, start: at, from: start, to: start + size.value, kids: [] };
    if (MASTERS.has(id.value)) e.kids = elements(bytes, e.from, e.to);
    out.push(e);
    at = e.to;
  }
  return out;
}
const uintOf = (bytes: Uint8Array, e: Element) => {
  let v = 0;
  for (let i = e.from; i < e.to; i++) v = v * 256 + bytes[i];
  return v;
};

test("EBML sizes take as few bytes as they fit", () => {
  expect([...vint(5)]).toEqual([0x85]);
  expect([...vint(126)]).toEqual([0xfe]);
  expect([...vint(127)]).toEqual([0x40, 0x7f]);
  expect([...vint(300)]).toEqual([0x41, 0x2c]);
});

test("the OpusHead says two channels at 48 kHz", () => {
  const head = opusHead(2, 48000);
  expect(String.fromCharCode(...head.subarray(0, 8))).toBe("OpusHead");
  expect(head[9]).toBe(2);
  expect(new DataView(head.buffer).getUint32(12, true)).toBe(48000);
});

test("a WebM reads back: its duration, its tracks, every block in order, and cues that point at clusters", () => {
  const fps = 30;
  const video = samples(100, 1e6 / fps, (i) => 200 + (i % 50), (i) => i % 30 === 0, 5);
  const audio = samples(167, 20000, () => 80, () => true, 77);
  const file = join(muxWebm({ codec: "V_VP9", width: 1920, height: 1080, samples: video }, { sampleRate: 48000, channels: 2, head: null, samples: audio }));
  const top = elements(file, 0, file.length);
  expect(top.map((e) => e.id)).toEqual([ID.EBML, ID.Segment]);
  const segment = top[1];
  expect(segment.to).toBe(file.length);
  const info = segment.kids.find((e) => e.id === ID.Info)!;
  const duration = info.kids.find((e) => e.id === ID.Duration)!;
  expect(new DataView(file.buffer, duration.from, 8).getFloat64(0)).toBeCloseTo(Math.max(100 / 30, (167 * 20) / 1000) * 1000, 0);

  const tracks = segment.kids.find((e) => e.id === ID.Tracks)!.kids;
  expect(tracks.length).toBe(2);
  const width = tracks[0].kids.find((e) => e.id === ID.Video)!.kids.find((e) => e.id === ID.PixelWidth)!;
  expect(uintOf(file, width)).toBe(1920);

  // The blocks, in file order, carry each sample's bytes; time never goes back.
  const clusters = segment.kids.filter((e) => e.id === ID.Cluster);
  expect(clusters.length).toBe(4);
  const got: { track: number; time: number; key: boolean; data: Uint8Array }[] = [];
  for (const c of clusters) {
    const base = uintOf(file, c.kids.find((e) => e.id === ID.Timestamp)!);
    for (const b of c.kids.filter((e) => e.id === ID.SimpleBlock)) {
      const view = new DataView(file.buffer, b.from);
      got.push({ track: file[b.from] & 0x7f, time: base + view.getInt16(1), key: !!(file[b.from + 3] & 0x80), data: file.subarray(b.from + 4, b.to) });
    }
  }
  expect(got.length).toBe(267);
  for (let i = 1; i < got.length; i++) expect(got[i].time).toBeGreaterThanOrEqual(got[i - 1].time);
  const frames = got.filter((g) => g.track === 1);
  frames.forEach((f, i) => {
    expect(f.data).toEqual(video[i].data);
    expect(f.key).toBe(video[i].key);
  });
  got.filter((g) => g.track === 2).forEach((g, i) => expect(g.data).toEqual(audio[i].data));

  // Each cluster starts on a keyframe, and the cues and the seek head point where things are.
  for (const c of clusters) {
    const first = c.kids.find((e) => e.id === ID.SimpleBlock)!;
    expect(file[first.from] & 0x7f).toBe(1);
    expect(file[first.from + 3] & 0x80).toBe(0x80);
  }
  const cues = segment.kids.find((e) => e.id === ID.Cues)!;
  const points = cues.kids.map((p) => uintOf(file, p.kids.find((e) => e.id === ID.CueTrackPositions)!.kids.find((e) => e.id === ID.CueClusterPosition)!));
  expect(points).toEqual(clusters.map((c) => c.start - segment.from));
  const seeks = segment.kids.find((e) => e.id === ID.SeekHead)!.kids.map((s) => uintOf(file, s.kids.find((e) => e.id === ID.SeekPosition)!));
  expect(seeks).toEqual([info.start, segment.kids.find((e) => e.id === ID.Tracks)!.start, cues.start].map((at) => at - segment.from));
});
