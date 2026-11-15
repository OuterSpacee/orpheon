/**
 * The MIDI reader (carried over from Song Studio) on files built in code (tests/lang/smf.ts): the two clocks through
 * a tempo change, the shorthands a reader must undo (running status, velocity-0 note-offs), a
 * format-0 file split by channel, karaoke text and lyric events, notes that are never released,
 * and the plain-words errors for files that are not MIDI or are cut short.
 */
import { describe, expect, test } from "bun:test";
import { parseMidi } from "../../src/lang/midi.ts";
import { chunk, FRERE_JACQUES, inTicks, line, lyric, meta, note, noteOff, noteOn, program, smf, sysex, tempo, text, timeSignature, track, trackName, TWINKLE, TWINKLE_WORDS, type Ev } from "./smf.ts";

/** ticks per quarter note */
const Q = 480;

/** a lyric or text event on each note of a tune */
function wordsOn(tune: [number, number][], words: string[], make: (tick: number, s: string) => Ev): Ev[] {
  const out: Ev[] = [];
  let tick = 0;
  let w = 0;
  for (const [midi, quarters] of tune) {
    if (midi > 0) out.push(make(tick, words[w++]));
    tick += quarters * Q;
  }
  return out;
}

describe("the two clocks", () => {
  test("a note's seconds go through the tempo map", () => {
    // 120 bpm (half a second a beat) for four beats, then 60 bpm (a second a beat)
    const song = parseMidi(
      smf(1, Q, [
        track([trackName("Two tempos"), tempo(0, 120), timeSignature(0, 3, 4), tempo(4 * Q, 60)]),
        track([trackName("Tune"), ...note(3 * Q, 2 * Q, 0, 60), ...note(6 * Q, 2 * Q, 0, 62, 80)]),
      ]),
    );
    expect(song.format).toBe("midi");
    expect(song.title).toBe("Two tempos");
    expect(song.tempos).toEqual([
      { beat: 0, time: 0, bpm: 120 },
      { beat: 4, time: 2, bpm: 60 },
    ]);
    expect(song.timeSignatures).toEqual([{ beat: 0, numerator: 3, denominator: 4 }]);
    expect(song.tracks.map((t) => [t.index, t.name, t.notes.length])).toEqual([
      [0, "Two tempos", 0],
      [1, "Tune", 2],
    ]);
    const [across, after] = song.tracks[1].notes;
    // beat 3 is 3 × 0.5 s; its two beats are one at 0.5 s and one at 1 s
    expect(across).toEqual({ midi: 60, beat: 3, beats: 2, time: 1.5, duration: 1.5, velocity: 96 });
    // beat 6 is 4 × 0.5 s + 2 × 1 s; two beats at 1 s each
    expect(after).toEqual({ midi: 62, beat: 6, beats: 2, time: 4, duration: 2, velocity: 80 });
    expect(song.duration).toBe(6);
    expect(song.warnings).toEqual([]);
  });

  test("a tempo change in a later track counts too", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track([tempo(4 * Q, 60), ...note(6 * Q, 2 * Q, 0, 62)])]));
    expect(song.tempos.map((t) => t.bpm)).toEqual([120, 60]);
    expect(song.tracks[1].notes[0].time).toBe(4);
  });

  test("of two tempos on one tick the last wins, and a tempo of zero is ignored", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 90), tempo(0, 60), meta(Q, 0x51, [0, 0, 0]), ...note(2 * Q, Q, 0, 60)])]));
    expect(song.tempos).toEqual([{ beat: 0, time: 0, bpm: 60 }]);
    expect(song.tracks[0].notes[0].time).toBe(2);
  });

  test("no tempo and no time signature: 120 bpm in 4/4, and the guess is said", () => {
    const song = parseMidi(smf(1, Q, [track(line(0, inTicks(TWINKLE, Q)))]));
    expect(song.tempos).toEqual([{ beat: 0, time: 0, bpm: 120 }]);
    expect(song.timeSignatures).toEqual([{ beat: 0, numerator: 4, denominator: 4 }]);
    expect(song.title).toBeNull();
    expect(song.tracks[0].notes[2]).toEqual({ midi: 67, beat: 2, beats: 1, time: 1, duration: 0.5, velocity: 96 });
    expect(song.duration).toBe(8);
    expect(song.warnings).toEqual(["The file sets no tempo, so 120 beats a minute is assumed."]);
  });

  test("a tempo that starts late leaves the MIDI default before it", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(2 * Q, 60), timeSignature(4 * Q, 6, 8), ...note(3 * Q, Q, 0, 60)])]));
    expect(song.tempos).toEqual([
      { beat: 0, time: 0, bpm: 120 },
      { beat: 2, time: 1, bpm: 60 },
    ]);
    expect(song.timeSignatures).toEqual([
      { beat: 0, numerator: 4, denominator: 4 },
      { beat: 4, numerator: 6, denominator: 8 },
    ]);
    expect(song.tracks[0].notes[0].time).toBe(2);
    expect(song.warnings).toEqual([]);
  });
});

describe("the shorthands", () => {
  const events = [tempo(0, 100), ...line(0, inTicks(FRERE_JACQUES, Q))];
  const plain = smf(1, Q, [track(events)]);

  test("running status reads the same as status bytes written out", () => {
    const running = smf(1, Q, [track(events, { runningStatus: true, velocityZeroOffs: true })]);
    // every note event but the first has lost its status byte
    expect(plain.length - running.length).toBe(2 * 14 - 1);
    expect(parseMidi(running)).toEqual(parseMidi(plain));
    expect(parseMidi(plain).tracks[0].notes.map((n) => n.midi)).toEqual(FRERE_JACQUES.map((n) => n[0]));
  });

  test("a note-on with velocity 0 ends the note", () => {
    const zeros = smf(1, Q, [track(events, { velocityZeroOffs: true })]);
    expect(zeros).not.toEqual(plain);
    expect(parseMidi(zeros)).toEqual(parseMidi(plain));
    expect(parseMidi(zeros).tracks[0].notes.map((n) => n.beats)).toEqual(FRERE_JACQUES.map((n) => n[1]));
  });

  test("running status carries on after a meta event in between", () => {
    // on, [lyric], then an off that reuses the 0x90 status the lyric came between
    const body = [0x00, 0x90, 60, 96, 0x00, 0xff, 0x05, 0x02, 0x6c, 0x61, 0x83, 0x60, 60, 0, 0x00, 0xff, 0x2f, 0x00];
    const song = parseMidi(smf(1, Q, [chunk("MTrk", body)]));
    expect(song.tracks[0].notes).toHaveLength(1);
    expect(song.tracks[0].notes[0].beats).toBe(1);
    expect(song.tracks[0].lyrics.map((l) => l.text)).toEqual(["la"]);
  });

  test("sysex, unknown meta events and other channel messages are skipped by their length", () => {
    const noise: Ev[] = [
      sysex(0, [0x7e, 0x7f, 0x09, 0x01]),
      meta(0, 0x7f, [1, 2, 3]),
      meta(0, 0x59, [0, 0]),
      { tick: 0, data: [0xb0, 7, 100] },
      { tick: Q / 2, data: [0xe0, 0, 64] },
      { tick: Q / 2, data: [0xd0, 5] },
      { tick: Q / 2, data: [0xa0, 60, 5] },
    ];
    const song = parseMidi(smf(1, Q, [track([tempo(0, 100), ...noise, ...line(0, inTicks(FRERE_JACQUES, Q))])]));
    expect(song).toEqual(parseMidi(plain));
  });
});

describe("notes", () => {
  test("a note never released ends where the track ends, with a warning", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120), trackName("Organ"), noteOn(0, 0, 60), ...note(0, Q, 0, 64)], { end: 4 * Q })]));
    expect(song.tracks[0].notes.map((n) => [n.midi, n.beats])).toEqual([
      [60, 4],
      [64, 1],
    ]);
    expect(song.warnings).toEqual(['1 note in track 1 ("Organ") was never released; it ends where the track ends.']);
  });

  test("a pitch struck again while it sounds ends the earlier note; a stray note-off is ignored", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120), noteOn(0, 0, 60), noteOn(Q, 0, 60, 50), noteOff(2 * Q, 0, 60), noteOff(3 * Q, 0, 60)])]));
    expect(song.tracks[0].notes.map((n) => [n.beat, n.beats, n.velocity])).toEqual([
      [0, 1, 96],
      [1, 1, 50],
    ]);
    expect(song.warnings).toEqual([]);
  });

  test("a note with no length is dropped, with a warning", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120), noteOn(0, 0, 72), noteOff(0, 0, 72), ...note(0, Q, 0, 60)])]));
    expect(song.tracks[0].notes.map((n) => n.midi)).toEqual([60]);
    expect(song.warnings).toEqual(["1 note with no length was left out."]);
  });

  test("notes are sorted by beat, then by pitch; the track's channel is where most notes are", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120), ...note(Q, Q, 2, 67), ...note(Q, Q, 2, 60), ...note(0, Q, 2, 64), ...note(0, Q, 5, 62)])]));
    expect(song.tracks[0].notes.map((n) => [n.beat, n.midi])).toEqual([
      [0, 62],
      [0, 64],
      [1, 60],
      [1, 67],
    ]);
    expect(song.tracks[0].channel).toBe(2);
    expect(song.tracks[0].drums).toBe(false);
  });

  test("the program is the one in force on the track's channel at its first note, from any track", () => {
    const song = parseMidi(
      smf(1, Q, [
        track([tempo(0, 120), program(0, 1, 52)]),
        track([program(0, 0, 73), ...note(Q, Q, 0, 60), program(3 * Q, 0, 40), ...note(4 * Q, Q, 0, 62)]),
        track(note(Q, Q, 1, 48)),
        track(note(Q, Q, 2, 48)),
        track(note(0, Q, 9, 36)),
      ]),
    );
    expect(song.tracks.map((t) => [t.channel, t.program, t.drums])).toEqual([
      [null, null, false],
      [0, 73, false],
      [1, 52, false],
      [2, null, false],
      [9, null, true],
    ]);
  });
});

describe("format 0", () => {
  const tune = inTicks(FRERE_JACQUES, Q);
  const bass: [number, number][] = [[36, 4 * Q], [36, 4 * Q], [43, 4 * Q], [36, 4 * Q]];
  const drums = Array.from({ length: 16 }, (_, i) => note(i * Q, Q / 4, 9, i % 2 ? 38 : 36)).flat();

  test("one track per channel that has notes", () => {
    const song = parseMidi(smf(0, Q, [track([trackName("Frère Jacques"), tempo(0, 120), program(0, 3, 73), program(0, 1, 32), program(8 * Q, 3, 40), ...line(3, tune), ...line(1, bass), ...drums])]));
    expect(song.title).toBe("Frère Jacques");
    expect(song.tracks.map((t) => [t.index, t.name, t.channel, t.program, t.drums, t.notes.length])).toEqual([
      [0, "Channel 2", 1, 32, false, 4],
      [1, "Channel 4", 3, 73, false, 14],
      [2, "Channel 10", 9, null, true, 16],
    ]);
    expect(song.tracks[1].notes.map((n) => n.midi)).toEqual(FRERE_JACQUES.map((n) => n[0]));
    expect(song.tracks.every((t) => t.notes.every((n) => n.beats > 0 && n.duration > 0))).toBe(true);
    expect(song.warnings).toEqual([]);
  });

  test("the lyrics go to the one channel whose notes they line up with", () => {
    const words = wordsOn(TWINKLE, TWINKLE_WORDS, lyric);
    const song = parseMidi(smf(0, Q, [track([tempo(0, 120), ...line(1, bass), ...line(3, inTicks(TWINKLE, Q)), ...drums, ...words])]));
    expect(song.tracks.map((t) => [t.name, t.lyrics.length])).toEqual([
      ["Channel 2", 0],
      ["Channel 4", 14],
      ["Channel 10", 0],
    ]);
    expect(song.tracks[1].lyrics.map((l) => l.text)).toEqual(TWINKLE_WORDS);
    // "how" is on beat 8
    expect(song.tracks[1].lyrics[7]).toEqual({ beat: 8, time: 4, text: "how " });
    expect(song.warnings).toEqual([]);
  });

  test("lyrics that line up with no channel are placed as a guess, and the guess is said", () => {
    // every word an eighth note late: a quarter of a second from any note
    const late = wordsOn(TWINKLE, TWINKLE_WORDS, (tick, s) => lyric(tick + Q / 2, s));
    const song = parseMidi(smf(0, Q, [track([tempo(0, 120), ...line(1, bass), ...line(3, inTicks(TWINKLE, Q)), ...late])]));
    expect(song.tracks.map((t) => t.lyrics.length)).toEqual([0, 14]);
    expect(song.warnings).toEqual(["The file's lyrics do not line up with any one channel's notes; they were put with Channel 4 as a guess."]);
  });

  test("a file with no notes keeps its one track", () => {
    const song = parseMidi(smf(0, Q, [track([trackName("Empty"), tempo(0, 120), lyric(0, "la")])]));
    expect(song.tracks.map((t) => [t.index, t.name, t.channel, t.notes.length, t.lyrics.length])).toEqual([[0, "Empty", null, 0, 1]]);
    expect(song.duration).toBe(0);
    expect(song.warnings).toEqual(["The file has no notes."]);
  });
});

describe("lyrics", () => {
  const conductor = track([tempo(0, 120)]);
  const kar = ["\\Twin", "kle ", "twin", "kle ", "lit", "tle ", "star", "/how ", "I ", "won", "der ", "what ", "you ", "are"];

  test('a karaoke "Words" track: its text is the lyrics, as written, without the @ headers', () => {
    const song = parseMidi(
      smf(1, Q, [
        conductor,
        track([trackName("Soft Karaoke"), text(0, "@KMIDI KARAOKE FILE"), text(0, "@V0100")]),
        track([trackName("Words"), text(0, "@LENGL"), text(0, "@TTwinkle Twinkle"), text(0, "@TTrad."), ...wordsOn(TWINKLE, kar, text)]),
        track([trackName("Melody"), text(0, "played on a toy piano"), ...line(3, inTicks(TWINKLE, Q))]),
      ]),
    );
    expect(song.title).toBe("Twinkle Twinkle");
    expect(song.tracks.map((t) => [t.name, t.notes.length, t.lyrics.length])).toEqual([
      ["", 0, 0],
      ["Soft Karaoke", 0, 0],
      ["Words", 0, 14],
      // an ordinary track's text event is a comment, not a lyric
      ["Melody", 14, 0],
    ]);
    expect(song.tracks[2].lyrics.map((l) => l.text)).toEqual(kar);
    expect(song.tracks[2].lyrics[7]).toEqual({ beat: 8, time: 4, text: "/how " });
    expect(song.tracks[2].channel).toBeNull();
    expect(song.warnings).toEqual([]);
  });

  test("karaoke headers mark a words track whatever its name; the first track's name outranks @T", () => {
    const song = parseMidi(smf(1, Q, [track([trackName("My song"), tempo(0, 120)]), track([trackName("Paroles"), text(0, "@TTwinkle"), text(0, "\\Twin"), text(Q, "kle")]), track(line(0, inTicks(TWINKLE, Q)))]));
    expect(song.title).toBe("My song");
    expect(song.tracks[1].lyrics.map((l) => l.text)).toEqual(["\\Twin", "kle"]);
  });

  test('"Soft Karaoke" as the first track is the format\'s marker, not the title', () => {
    const song = parseMidi(smf(1, Q, [track([trackName("Soft Karaoke"), tempo(0, 120), text(0, "@KMIDI KARAOKE FILE")]), track([trackName("Words"), text(0, "@TFrère Jacques"), text(0, "Frè")])]));
    expect(song.title).toBe("Frère Jacques");
  });

  test("lyric events stay with their track, in UTF-8 or Latin-1", () => {
    const song = parseMidi(
      smf(1, Q, [
        conductor,
        track([trackName("Voice"), ...line(0, inTicks(FRERE_JACQUES, Q)), lyric(0, "Frè"), lyric(Q, [0x72, 0x65, 0x20]), lyric(2 * Q, [0x4a, 0x61, 0x63, 0x71, 0x75, 0xe8, 0x73, 0x00])]),
      ]),
    );
    expect(song.tracks[1].lyrics).toEqual([
      { beat: 0, time: 0, text: "Frè" },
      { beat: 1, time: 0.5, text: "re " },
      // 0xE8 alone is not UTF-8: read as Latin-1 "è"; the padding NUL is dropped
      { beat: 2, time: 1, text: "Jacquès" },
    ]);
    expect(song.tracks[0].lyrics).toEqual([]);
  });
});

describe("files it cannot read say why", () => {
  const good = smf(1, Q, [track([trackName("Song"), tempo(0, 120)]), track(line(0, inTicks(TWINKLE, Q)))]);

  test("not a MIDI file", () => {
    expect(() => parseMidi(new TextEncoder().encode("ID3 this is somebody's mp3, not a MIDI file"))).toThrow('This does not look like a MIDI file: it does not start with the "MThd" header every MIDI file has.');
    expect(() => parseMidi(new Uint8Array([0x4d, 0x54]))).toThrow("does not look like a MIDI file");
    expect(() => parseMidi(new Uint8Array(0))).toThrow("The file is empty.");
  });

  test("cut short", () => {
    expect(() => parseMidi(good.slice(0, 10))).toThrow("This MIDI file is cut short: it ends inside its header.");
    expect(() => parseMidi(good.slice(0, 14))).toThrow("This MIDI file is cut short: it has a header but no tracks.");
    const secondTrack = good.length - track(line(0, inTicks(TWINKLE, Q))).length;
    expect(() => parseMidi(good.slice(0, secondTrack + 5))).toThrow("This MIDI file is cut short: it ends at the start of track 2.");
    expect(() => parseMidi(good.slice(0, good.length - 20))).toThrow(/^This MIDI file is cut short: track 2 should be \d+ bytes long, but the file ends \d+ bytes into it\.$/);
  });

  test("a file that ends cleanly a track early is read, with a warning", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track(line(0, inTicks(TWINKLE, Q)))], 3));
    expect(song.tracks).toHaveLength(2);
    expect(song.warnings).toEqual(["The file says it has 3 tracks but only 2 are in it; it may be cut short."]);
  });

  test("stray bytes after the last track and chunks that are not tracks are passed over", () => {
    const padded = new Uint8Array(good.length + 3);
    padded.set(good);
    expect(parseMidi(padded)).toEqual(parseMidi(good));
    const withOther = smf(1, Q, [track([trackName("Song"), tempo(0, 120)]), chunk("XFIH", [1, 2, 3, 4, 5]), track(line(0, inTicks(TWINKLE, Q)))], 2);
    expect(parseMidi(withOther)).toEqual(parseMidi(good));
  });

  test("format 2 and SMPTE time", () => {
    expect(() => parseMidi(smf(2, Q, [track(line(0, inTicks(TWINKLE, Q)))]))).toThrow("This is a format 2 MIDI file: a set of separate patterns, not one song.");
    // 0xE728: 25 frames a second, 40 ticks a frame
    expect(() => parseMidi(smf(1, 0xe728, [track(line(0, inTicks(TWINKLE, Q)))]))).toThrow("counts time in film frames (SMPTE) instead of beats. That is rare and not supported");
    expect(() => parseMidi(smf(1, 0, [track([])]))).toThrow("This MIDI file is damaged");
  });

  test("a track whose bytes are not MIDI events", () => {
    // a data byte with no status before it
    expect(() => parseMidi(smf(1, Q, [chunk("MTrk", [0x00, 0x45, 0x10])]))).toThrow("This MIDI file is damaged: track 1 has bytes that are not MIDI events.");
    // a note-on missing its velocity
    expect(() => parseMidi(smf(1, Q, [track([tempo(0, 120)]), chunk("MTrk", [0x00, 0x90, 0x3c])]))).toThrow("This MIDI file is damaged: track 2 ends in the middle of an event.");
    // a meta event longer than its track
    expect(() => parseMidi(smf(1, Q, [chunk("MTrk", [0x00, 0xff, 0x05, 0x20, 0x6c, 0x61])]))).toThrow("This MIDI file is damaged: track 1 ends in the middle of an event.");
  });
});
