/**
 * Standard MIDI Files built in code, for the reader's tests: events at ticks, tracks made of
 * them, and two public-domain tunes. Written for these tests (the original helper did not come
 * with the carried tests).
 */

/** One event at a tick: its bytes without the delta time. */
export interface Ev {
  tick: number;
  data: number[];
}

const utf8 = (s: string): number[] => [...new TextEncoder().encode(s)];

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

export function meta(tick: number, type: number, data: number[]): Ev {
  return { tick, data: [0xff, type, ...vlq(data.length), ...data] };
}
export function sysex(tick: number, data: number[]): Ev {
  return { tick, data: [0xf0, ...vlq(data.length), ...data] };
}
export const tempo = (tick: number, bpm: number): Ev => {
  const us = Math.round(60_000_000 / bpm);
  return meta(tick, 0x51, [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]);
};
export const timeSignature = (tick: number, numerator: number, denominator: number): Ev => meta(tick, 0x58, [numerator, Math.log2(denominator), 24, 8]);
export const trackName = (name: string): Ev => meta(0, 0x03, utf8(name));
export const text = (tick: number, s: string): Ev => meta(tick, 0x01, utf8(s));
export const lyric = (tick: number, s: string | number[]): Ev => meta(tick, 0x05, typeof s === "string" ? utf8(s) : s);
export const program = (tick: number, channel: number, prog: number): Ev => ({ tick, data: [0xc0 | channel, prog] });
export const noteOn = (tick: number, channel: number, midi: number, velocity = 96): Ev => ({ tick, data: [0x90 | channel, midi, velocity] });
export const noteOff = (tick: number, channel: number, midi: number): Ev => ({ tick, data: [0x80 | channel, midi, 64] });
/** a note: its on and its off */
export const note = (tick: number, length: number, channel: number, midi: number, velocity = 96): Ev[] => [noteOn(tick, channel, midi, velocity), noteOff(tick + length, channel, midi)];

/** [midi, length in ticks] one after another from tick 0; a midi of 0 is a rest */
export function line(channel: number, tune: [number, number][]): Ev[] {
  const out: Ev[] = [];
  let tick = 0;
  for (const [midi, ticks] of tune) {
    if (midi > 0) out.push(...note(tick, ticks, channel, midi));
    tick += ticks;
  }
  return out;
}

/** a tune in quarter notes to one in ticks */
export const inTicks = (tune: [number, number][], q: number): [number, number][] => tune.map(([m, quarters]) => [m, quarters * q]);

export function chunk(id: string, body: number[]): Uint8Array {
  const n = body.length;
  return new Uint8Array([...[...id].map((c) => c.charCodeAt(0)), (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, ...body]);
}

export interface TrackOptions {
  /** leave out a status byte the event before already gave */
  runningStatus?: boolean;
  /** write note-offs as note-ons with velocity 0 */
  velocityZeroOffs?: boolean;
  /** the tick of the end-of-track event (default: the last event's) */
  end?: number;
}

/** An MTrk chunk from events, sorted by tick (events on one tick keep their order). */
export function track(events: Ev[], options: TrackOptions = {}): Uint8Array {
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || a.i - b.i).map((x) => x.e);
  const body: number[] = [];
  let tick = 0;
  let status = 0;
  for (const ev of sorted) {
    let data = ev.data;
    if (options.velocityZeroOffs && (data[0] & 0xf0) === 0x80) data = [0x90 | (data[0] & 0x0f), data[1], 0];
    body.push(...vlq(ev.tick - tick));
    tick = ev.tick;
    if (data[0] < 0xf0 && options.runningStatus && data[0] === status) body.push(...data.slice(1));
    else body.push(...data);
    if (data[0] < 0xf0) status = data[0];
  }
  const end = Math.max(tick, options.end ?? tick);
  body.push(...vlq(end - tick), 0xff, 0x2f, 0x00);
  return chunk("MTrk", body);
}

/** A whole file. `declared` is the track count the header claims (default: the chunks given). */
export function smf(format: number, division: number, tracks: Uint8Array[], declared = tracks.length): Uint8Array {
  const header = chunk("MThd", [format >> 8, format & 0xff, declared >> 8, declared & 0xff, (division >> 8) & 0xff, division & 0xff]);
  const all = [header, ...tracks];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Twinkle Twinkle Little Star, the first line: [midi, quarter notes] */
export const TWINKLE: [number, number][] = [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
];
export const TWINKLE_WORDS = ["Twin", "kle ", "twin", "kle ", "lit", "tle ", "star ", "how ", "I ", "won", "der ", "what ", "you ", "are"];

/** Frère Jacques, the first two lines */
export const FRERE_JACQUES: [number, number][] = [
  [60, 1], [62, 1], [64, 1], [60, 1],
  [60, 1], [62, 1], [64, 1], [60, 1],
  [64, 1], [65, 1], [67, 2],
  [64, 1], [65, 1], [67, 2],
];
