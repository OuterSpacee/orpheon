// A WebM file around VP9 (or VP8) video and Opus sound: the fallback for a browser that cannot
// encode H.264 or AAC. WebM is Matroska (an EBML tree: an id, a size, the content) with fewer
// kinds of element; see the Matroska specification (RFC 9559) and the WebM container guidelines.
//
// The frames go in clusters that each start on a video keyframe, sound and picture in time order.
// The index of clusters (Cues) is written at the end and pointed to from the front (SeekHead), so
// a player can seek at once.
import { flatten, measure, pack } from "./bytes.ts";
import type { Piece, Tree } from "./bytes.ts";
import type { Sample } from "./mp4.ts";

export interface WebmVideo {
  codec: "V_VP9" | "V_VP8";
  width: number;
  height: number;
  samples: Sample[];
}

export interface WebmAudio {
  sampleRate: number;
  channels: number;
  /** The OpusHead the encoder gave, or null to write the plain one. */
  head: Uint8Array | null;
  samples: Sample[];
}

/** An element id's own bytes: ids carry their length marker already. */
function idBytes(id: number): Uint8Array {
  const n = id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1;
  return pack((w) => {
    for (let i = n - 1; i >= 0; i--) w.u8((id / 2 ** (8 * i)) & 0xff);
  });
}

/** A size as an EBML variable-length number, in as few bytes as it fits. */
export function vint(value: number, least = 1): Uint8Array {
  let n = least;
  while (n < 8 && value >= 2 ** (7 * n) - 1) n++;
  return pack((w) => {
    for (let i = n - 1; i >= 0; i--) {
      let byte = Math.floor(value / 2 ** (8 * i)) & 0xff;
      if (i === n - 1) byte |= 0x100 >> n;
      w.u8(byte);
    }
  });
}

function el(id: number, ...kids: Piece[]): Tree {
  const head = idBytes(id);
  return { head: (n) => pack((w) => w.bytes(head).bytes(vint(n))), kids };
}

function uint(id: number, value: number, bytes = 0): Tree {
  let n = bytes || 1;
  while (!bytes && n < 8 && value >= 2 ** (8 * n)) n++;
  return el(id, pack((w) => {
    for (let i = n - 1; i >= 0; i--) w.u8(Math.floor(value / 2 ** (8 * i)) & 0xff);
  }));
}

const float = (id: number, value: number) => el(id, pack((w) => w.f64(value)));
const text = (id: number, value: string) => el(id, pack((w) => w.text(value)));

export const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, Duration: 0x4489, MuxingApp: 0x4d80, WritingApp: 0x5741,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
  CodecID: 0x86, CodecPrivate: 0x63a2, CodecDelay: 0x56aa, SeekPreRoll: 0x56bb, Video: 0xe0, PixelWidth: 0xb0,
  PixelHeight: 0xba, Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
} as const;

/** The plain OpusHead for two channels at 48 kHz (RFC 7845, 5.1), with the encoder's usual delay. */
export function opusHead(channels: number, sampleRate: number, preSkip = 312): Uint8Array {
  const head = pack((w) => w.text("OpusHead").u8(1).u8(channels).u16(0).u32(0).u16(0).u8(0));
  // Its numbers are little-endian, unlike everything else here.
  const view = new DataView(head.buffer);
  view.setUint16(10, preSkip, true);
  view.setUint32(12, sampleRate, true);
  return head;
}

/** The file, as a list of byte arrays in order (for a Blob). Times are in milliseconds inside it. */
export function muxWebm(video: WebmVideo, audio: WebmAudio | null): Uint8Array[] {
  const ms = (us: number) => Math.round(us / 1000);
  const end = Math.max(...[...video.samples, ...(audio?.samples ?? [])].map((s) => s.time + s.duration), 0);
  const ebml = el(
    ID.EBML,
    uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), text(0x4282, "webm"), uint(0x4287, 4), uint(0x4285, 2),
  );
  const info = el(ID.Info, uint(ID.TimestampScale, 1_000_000), float(ID.Duration, end / 1000), text(ID.MuxingApp, "Orpheon"), text(ID.WritingApp, "Orpheon"));
  const head = audio ? (audio.head ?? opusHead(audio.channels, audio.sampleRate)) : null;
  const preSkip = head && head.length >= 12 ? new DataView(head.buffer, head.byteOffset).getUint16(10, true) : 0;
  const tracks = el(
    ID.Tracks,
    el(ID.TrackEntry, uint(ID.TrackNumber, 1), uint(ID.TrackUID, 1), uint(ID.TrackType, 1), uint(ID.FlagLacing, 0), text(ID.CodecID, video.codec),
      el(ID.Video, uint(ID.PixelWidth, video.width), uint(ID.PixelHeight, video.height))),
    ...(audio && head
      ? [el(ID.TrackEntry, uint(ID.TrackNumber, 2), uint(ID.TrackUID, 2), uint(ID.TrackType, 2), uint(ID.FlagLacing, 0), text(ID.CodecID, "A_OPUS"),
          el(ID.CodecPrivate, head), uint(ID.CodecDelay, Math.round((preSkip / 48000) * 1e9)), uint(ID.SeekPreRoll, 80_000_000),
          el(ID.Audio, float(ID.SamplingFrequency, audio.sampleRate), uint(ID.Channels, audio.channels)))]
      : []),
  );

  // Every sample in time order, video before sound at the same instant; a cluster starts at each
  // video keyframe (or when a block's time would no longer fit the cluster's 16-bit offset).
  const all = [
    ...video.samples.map((s) => ({ s, track: 1 })),
    ...(audio?.samples ?? []).map((s) => ({ s, track: 2 })),
  ].sort((a, b) => a.s.time - b.s.time || a.track - b.track);
  const clusters: { time: number; blocks: Piece[] }[] = [];
  for (const { s, track } of all) {
    const t = ms(s.time);
    let c = clusters[clusters.length - 1];
    if (!c || (track === 1 && s.key) || t - c.time > 30000) {
      c = { time: t, blocks: [] };
      clusters.push(c);
    }
    const flags = s.key ? 0x80 : 0;
    c.blocks.push(el(ID.SimpleBlock, pack((w) => w.u8(0x80 | track).i16(t - c!.time).u8(flags)), s.data));
  }
  const clusterTrees = clusters.map((c) => el(ID.Cluster, uint(ID.Timestamp, c.time), ...c.blocks));

  // Positions are measured from the start of the segment's content. The SeekHead's own size is
  // fixed by writing its positions in eight bytes.
  const seek = (id: number, at: number) => el(ID.Seek, el(ID.SeekID, idBytes(id)), uint(ID.SeekPosition, at, 8));
  const seekHeadSize = measure(el(ID.SeekHead, seek(ID.Info, 0), seek(ID.Tracks, 0), seek(ID.Cues, 0)));
  const infoAt = seekHeadSize;
  const tracksAt = infoAt + measure(info);
  let at = tracksAt + measure(tracks);
  const cuePoints: Tree[] = [];
  clusters.forEach((c, i) => {
    cuePoints.push(el(ID.CuePoint, uint(ID.CueTime, c.time), el(ID.CueTrackPositions, uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, at))));
    at += measure(clusterTrees[i]);
  });
  const cues = el(ID.Cues, ...cuePoints);
  const seekHead = el(ID.SeekHead, seek(ID.Info, infoAt), seek(ID.Tracks, tracksAt), seek(ID.Cues, at));
  const segment = el(ID.Segment, seekHead, info, tracks, ...clusterTrees, cues);
  const out = flatten(ebml);
  return flatten(segment, out);
}
