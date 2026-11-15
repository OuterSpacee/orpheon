/**
 * A Standard MIDI File (.mid, or a karaoke .kar) → an `ImportedSong`: every track's notes and
 * lyrics on both clocks, beats and seconds, with the seconds worked out through the file's
 * tempo map. Written here, no dependencies; nothing calls the engine.
 *
 * What it reads: formats 0 and 1, running status, note-on with velocity 0 as note-off, tempo
 * changes (from every track: they belong in the first, but files put them anywhere), time
 * signatures, track names, program changes, lyric events, and karaoke text. Sysex and meta
 * events it has no use for are skipped by their length.
 *
 * What it refuses, with an error in plain words (the UI shows it to whoever dropped the file):
 * anything that is not a MIDI file, a file cut short inside its header or a track, a track
 * whose bytes are not MIDI events, format 2 (separate patterns, not one song), and SMPTE time
 * (ticks counted in film frames, not beats: rare, and there are no beats to sing from).
 *
 * Decisions:
 * - `tracks[i].index === i`, always. A format-1 file keeps every track, the ones with no notes
 *   too (the tempo track, a karaoke "Words" track), so the index is the track's place in the
 *   file. A format-0 file has one track holding every channel: it is split into one track per
 *   channel that has notes, named "Channel N" (1-based, as players show it), so they can be
 *   chosen between like tracks. A format-0 header followed by several tracks is read as format 1.
 * - A format-0 file's lyrics sit in that one track, tied to no channel. They go to the channel
 *   whose note starts they line up with best (among equals, the likeliest melody), never to
 *   drums, and to one channel only, so collecting the lyrics across tracks never doubles them.
 *   When fewer than half line up with any channel, a warning says the placing was a guess.
 * - The title is the first track's name in a format-1 file, the one track's name in a format-0
 *   file (in both, the MIDI spec calls that name the sequence's), and failing that a karaoke
 *   "@T" line. "Soft Karaoke" is the karaoke format's own marker, never a title.
 * - Karaoke: text events (0x01) count as lyrics in a track named "Words", or in any track that
 *   has an "@K" or "@T" header line. The "@" header lines are dropped from the lyrics; the rest
 *   is kept as written, "\" and "/" line marks included. Lyric events (0x05) always count.
 * - Text is read as UTF-8, and as Latin-1 when it is not valid UTF-8 (old karaoke files).
 * - Tempo: 120 bpm until the file says otherwise (the MIDI default), with a warning only when
 *   it never says. Of several tempo events on one tick the last wins. Likewise the time
 *   signature is 4/4 until the file says otherwise, so both lists always have a point at beat 0.
 * - A note never released ends where its track ends (warned). A second note-on for a pitch
 *   still sounding on that channel ends the first. Notes left with no length are dropped
 *   (warned, with the count). A note-off with no note to end is ignored.
 * - A track's channel is the one most of its notes are on, and its program is the one in force
 *   on that channel at the track's first note there. Channels are shared by the whole file, so
 *   a program change in another track counts.
 * - Running status is kept across meta and sysex events. The spec says they cancel it, but some
 *   writers carry on regardless, and a strict reader could only fail on such a file.
 * - A file with fewer tracks than its header promises, ending cleanly between tracks, is read
 *   with a warning; chunks that are not tracks are skipped, as the spec asks.
 */
import { lyricFit, rankMelodyTracks } from "./melody.ts";
import type { ImportedSong, ImportedTrack, TempoPoint, TimedLyric, TimeSignature, TrackNote } from "./song-types.ts";

interface RawNote {
  tick: number;
  end: number;
  midi: number;
  velocity: number;
  channel: number;
}

interface RawTrack {
  name: string;
  notes: RawNote[];
  /** lyric (0x05) and text (0x01) events, in file order */
  words: { tick: number; text: string; lyric: boolean }[];
  tempos: { tick: number; us: number }[];
  signatures: { tick: number; numerator: number; denominator: number }[];
  programs: { tick: number; channel: number; program: number }[];
  /** notes still sounding at the track's end */
  unreleased: number;
  /** notes dropped for having no length */
  empty: number;
}

const ascii = (bytes: Uint8Array, at: number, n: number): string => String.fromCharCode(...bytes.subarray(at, at + n));
const u16 = (bytes: Uint8Array, at: number): number => (bytes[at] << 8) | bytes[at + 1];
const u32 = (bytes: Uint8Array, at: number): number => bytes[at] * 0x1000000 + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]);

function decodeText(data: Uint8Array): string {
  let s: string;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    // not UTF-8: Latin-1, where each byte is its own character
    s = Array.from(data, (c) => String.fromCharCode(c)).join("");
  }
  // some writers pad text with NULs
  return s.replace(/\0/g, "");
}

/** One MTrk chunk's events. `n` is the track's number as a person counts (from 1), for errors. */
function readTrack(bytes: Uint8Array, start: number, end: number, n: number): RawTrack {
  const t: RawTrack = { name: "", notes: [], words: [], tempos: [], signatures: [], programs: [], unreleased: 0, empty: 0 };
  let pos = start;
  let tick = 0;
  let status = 0;
  const need = (k: number): void => {
    if (pos + k > end) throw new Error(`This MIDI file is damaged: track ${n} ends in the middle of an event.`);
  };
  const byte = (): number => {
    need(1);
    return bytes[pos++];
  };
  const dataByte = (): number => {
    const b = byte();
    if (b & 0x80) throw new Error(`This MIDI file is damaged: track ${n} has bytes that are not MIDI events.`);
    return b;
  };
  const vlq = (): number => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = byte();
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error(`This MIDI file is damaged: track ${n} has a length that never ends.`);
  };
  /** notes sounding, by channel and pitch */
  const sounding = new Map<number, { tick: number; velocity: number }>();
  const release = (key: number, at: number): void => {
    const on = sounding.get(key);
    if (!on) return;
    sounding.delete(key);
    if (at > on.tick) t.notes.push({ tick: on.tick, end: at, midi: key & 0x7f, velocity: on.velocity, channel: key >> 7 });
    else t.empty++;
  };

  while (pos < end) {
    tick += vlq();
    const first = byte();
    if (first === 0xff) {
      const type = byte();
      const len = vlq();
      need(len);
      const data = bytes.subarray(pos, pos + len);
      pos += len;
      if (type === 0x2f) break; // End of Track
      if (type === 0x01 || type === 0x05) t.words.push({ tick, text: decodeText(data), lyric: type === 0x05 });
      else if (type === 0x03) t.name ||= decodeText(data).trim();
      else if (type === 0x51 && len >= 3) {
        const us = (data[0] << 16) | (data[1] << 8) | data[2];
        // a tempo of zero would put every later note at the same instant
        if (us > 0) t.tempos.push({ tick, us });
      } else if (type === 0x58 && len >= 2) t.signatures.push({ tick, numerator: data[0], denominator: 2 ** data[1] });
      continue;
    }
    if (first === 0xf0 || first === 0xf7) {
      const len = vlq();
      need(len);
      pos += len;
      continue;
    }
    let d1: number;
    if (first & 0x80) {
      // 0xF1..0xFE are live-wire messages: a file has no place for them
      if (first >= 0xf0) throw new Error(`This MIDI file is damaged: track ${n} has bytes that are not MIDI events.`);
      status = first;
      d1 = dataByte();
    } else {
      // running status: the event reuses the last status byte
      if (!status) throw new Error(`This MIDI file is damaged: track ${n} has bytes that are not MIDI events.`);
      d1 = first;
    }
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : dataByte();
    const key = (channel << 7) | d1;
    if (kind === 0x90 && d2 > 0) {
      release(key, tick);
      sounding.set(key, { tick, velocity: d2 });
    } else if (kind === 0x80 || kind === 0x90) release(key, tick);
    else if (kind === 0xc0) t.programs.push({ tick, channel, program: d1 });
  }

  t.unreleased = sounding.size;
  for (const key of [...sounding.keys()]) release(key, tick);
  return t;
}

/** Read a Standard MIDI File. Throws an Error with a plain-words message when it cannot. */
export function parseMidi(bytes: Uint8Array): ImportedSong {
  if (bytes.length === 0) throw new Error("The file is empty.");
  if (bytes.length < 4 || ascii(bytes, 0, 4) !== "MThd") throw new Error('This does not look like a MIDI file: it does not start with the "MThd" header every MIDI file has.');
  if (bytes.length < 14) throw new Error("This MIDI file is cut short: it ends inside its header.");
  const headerLength = u32(bytes, 4);
  if (headerLength < 6) throw new Error("This MIDI file is damaged: its header is too short.");
  const format = u16(bytes, 8);
  const declared = u16(bytes, 10);
  const division = u16(bytes, 12);
  if (format > 1) {
    throw new Error(
      format === 2
        ? "This is a format 2 MIDI file: a set of separate patterns, not one song. Save it as format 0 or 1 and try again."
        : `This MIDI file is damaged: it says it is format ${format}, and there are only formats 0, 1 and 2.`,
    );
  }
  if (division & 0x8000) throw new Error("This MIDI file counts time in film frames (SMPTE) instead of beats. That is rare and not supported: save it with a ticks-per-beat resolution and try again.");
  if (division === 0) throw new Error("This MIDI file is damaged: it says a beat has no ticks.");

  const raws: RawTrack[] = [];
  for (let pos = 8 + headerLength; pos < bytes.length; ) {
    // every promised track is in hand: stray bytes after them are not worth refusing the file for
    const spare = raws.length >= declared;
    const start = pos + 8;
    if (start > bytes.length) {
      if (spare) break;
      throw new Error(`This MIDI file is cut short: it ends at the start of track ${raws.length + 1}.`);
    }
    const end = start + u32(bytes, pos + 4);
    if (end > bytes.length && spare) break;
    if (ascii(bytes, pos, 4) === "MTrk") {
      if (end > bytes.length) throw new Error(`This MIDI file is cut short: track ${raws.length + 1} should be ${end - start} bytes long, but the file ends ${bytes.length - start} bytes into it.`);
      raws.push(readTrack(bytes, start, end, raws.length + 1));
    } else if (end > bytes.length) throw new Error(`This MIDI file is cut short: it ends after track ${raws.length}, in the middle of other data.`);
    pos = end;
  }
  if (raws.length === 0) throw new Error("This MIDI file is cut short: it has a header but no tracks.");

  const warnings: string[] = [];
  if (raws.length < declared) warnings.push(`The file says it has ${declared} tracks but only ${raws.length} ${raws.length === 1 ? "is" : "are"} in it; it may be cut short.`);

  // The tempo map: where each tempo starts, in ticks and in seconds.
  const map: { tick: number; time: number; us: number }[] = [{ tick: 0, time: 0, us: 500_000 }];
  const tempoEvents = raws.flatMap((r) => r.tempos).sort((a, b) => a.tick - b.tick);
  if (tempoEvents.length === 0) warnings.push("The file sets no tempo, so 120 beats a minute is assumed.");
  for (const e of tempoEvents) {
    const last = map[map.length - 1];
    if (e.tick === last.tick) last.us = e.us;
    else map.push({ tick: e.tick, time: last.time + ((e.tick - last.tick) * last.us) / (division * 1e6), us: e.us });
  }
  const seconds = (tick: number): number => {
    let lo = 0;
    for (let hi = map.length - 1; lo < hi; ) {
      const mid = (lo + hi + 1) >> 1;
      if (map[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return map[lo].time + ((tick - map[lo].tick) * map[lo].us) / (division * 1e6);
  };
  const tempos: TempoPoint[] = map.map((m) => ({ beat: m.tick / division, time: m.time, bpm: 60_000_000 / m.us }));

  const timeSignatures: TimeSignature[] = [{ beat: 0, numerator: 4, denominator: 4 }];
  for (const s of raws.flatMap((r) => r.signatures).sort((a, b) => a.tick - b.tick)) {
    const point = { beat: s.tick / division, numerator: s.numerator, denominator: s.denominator };
    if (point.beat === timeSignatures[timeSignatures.length - 1].beat) timeSignatures[timeSignatures.length - 1] = point;
    else timeSignatures.push(point);
  }

  const programs = raws.flatMap((r) => r.programs).sort((a, b) => a.tick - b.tick);
  const track = (index: number, name: string, notes: RawNote[], lyrics: TimedLyric[]): ImportedTrack => {
    const counts = new Array<number>(16).fill(0);
    for (const n of notes) counts[n.channel]++;
    const channel = notes.length ? counts.indexOf(Math.max(...counts)) : null;
    const sorted = [...notes].sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    const firstTick = sorted.find((n) => n.channel === channel)?.tick ?? 0;
    let program: number | null = null;
    for (const p of programs) if (p.channel === channel && p.tick <= firstTick) program = p.program;
    return {
      index,
      name,
      channel,
      program,
      drums: channel === 9,
      notes: sorted.map((n): TrackNote => {
        const time = seconds(n.tick);
        return { midi: n.midi, beat: n.tick / division, beats: (n.end - n.tick) / division, time, duration: seconds(n.end) - time, velocity: n.velocity };
      }),
      lyrics,
    };
  };

  let karaokeTitle: string | null = null;
  const lyricsOf = (r: RawTrack): TimedLyric[] => {
    const karaoke = /^words$/i.test(r.name) || r.words.some((w) => !w.lyric && /^@[KT]/.test(w.text));
    const out: TimedLyric[] = [];
    for (const w of r.words) {
      if (!w.lyric && !karaoke) continue; // a plain text event: a comment, a copyright line
      if (!w.lyric && w.text.startsWith("@")) {
        if (w.text.startsWith("@T")) karaokeTitle ??= w.text.slice(2).trim() || null;
        continue;
      }
      out.push({ beat: w.tick / division, time: seconds(w.tick), text: w.text });
    }
    return out;
  };

  let tracks: ImportedTrack[];
  if (format === 0 && raws.length === 1) {
    const r = raws[0];
    const lyrics = lyricsOf(r);
    const channels = [...new Set(r.notes.map((n) => n.channel))].sort((a, b) => a - b);
    if (channels.length === 0) tracks = [track(0, r.name, [], lyrics)];
    else {
      tracks = channels.map((c, i) => track(i, `Channel ${c + 1}`, r.notes.filter((n) => n.channel === c), []));
      if (lyrics.length) {
        // the channel the lyrics line up with; the ranking (best first) settles equals
        const order = rankMelodyTracks({ title: null, format: "midi", tempos, timeSignatures, tracks, duration: 0, warnings: [] }).map((k) => k.track);
        let best = order.length ? order[0] : 0;
        for (const i of order) if (lyricFit(tracks[i].notes, lyrics) > lyricFit(tracks[best].notes, lyrics)) best = i;
        tracks[best].lyrics = lyrics;
        const onNotes = lyrics.filter((l) => lyricFit(tracks[best].notes, [l]) > 0).length;
        if (onNotes * 2 < lyrics.length) warnings.push(`The file's lyrics do not line up with any one channel's notes; they were put with ${tracks[best].name} as a guess.`);
      }
    }
  } else tracks = raws.map((r, i) => track(i, r.name, r.notes, lyricsOf(r)));

  raws.forEach((r, i) => {
    if (r.unreleased) warnings.push(`${r.unreleased} ${r.unreleased === 1 ? "note" : "notes"} in track ${i + 1}${r.name ? ` ("${r.name}")` : ""} ${r.unreleased === 1 ? "was" : "were"} never released; ${r.unreleased === 1 ? "it ends" : "they end"} where the track ends.`);
  });
  const empty = raws.reduce((s, r) => s + r.empty, 0);
  if (empty) warnings.push(`${empty} ${empty === 1 ? "note" : "notes"} with no length ${empty === 1 ? "was" : "were"} left out.`);
  if (tracks.every((t) => t.notes.length === 0)) warnings.push("The file has no notes.");

  const firstName = /^soft karaoke$/i.test(raws[0].name) ? "" : raws[0].name;
  return {
    title: firstName || karaokeTitle,
    format: "midi",
    tempos,
    timeSignatures,
    tracks,
    duration: tracks.reduce((end, t) => t.notes.reduce((e, n) => Math.max(e, n.time + n.duration), end), 0),
    warnings,
  };
}
