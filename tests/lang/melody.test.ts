/**
 * Melody extraction (carried over from Song Studio): which track of an imported song is the tune, one voice out
 * of a track that plays chords (the highest note of each onset, cut where the next begins, tiny
 * notes dropped, tiny rests closed), and the line moved into a singer's range by octaves.
 * The songs are public-domain tunes built in code (tests/lang/smf.ts).
 */
import { describe, expect, test } from "bun:test";
import { extractMelody, fitRange, rankMelodyTracks } from "../../src/lang/melody.ts";
import { parseMidi } from "../../src/lang/midi.ts";
import type { ImportedTrack, Melody } from "../../src/lang/song-types.ts";
import { FRERE_JACQUES, inTicks, line, lyric, note, smf, tempo, text, track, trackName, TWINKLE, TWINKLE_WORDS, type Ev } from "./smf.ts";

const Q = 480;

/** a track from [midi, seconds, seconds] at 120 bpm (two beats a second) */
function trackOf(notes: [number, number, number][]): ImportedTrack {
  return {
    index: 3,
    name: "",
    channel: 0,
    program: null,
    drums: false,
    lyrics: [],
    notes: notes.map(([midi, time, duration]) => ({ midi, beat: time * 2, beats: duration * 2, time, duration, velocity: 96 })),
  };
}

/** [midi, start, length] in seconds, rounded to the millisecond */
const shape = (m: Melody): [number, number, number][] => m.notes.map((n) => [n.midi, Math.round(n.time * 1000) / 1000, Math.round(n.duration * 1000) / 1000]);

/** sorted, no two notes overlapping, and both clocks telling the same story (at 120 bpm) */
function expectOneVoice(m: Melody, beatsPerSecond = 2): void {
  for (let i = 0; i < m.notes.length; i++) {
    const n = m.notes[i];
    expect(n.duration).toBeGreaterThan(0);
    expect(n.beat).toBeCloseTo(n.time * beatsPerSecond, 9);
    expect(n.beats).toBeCloseTo(n.duration * beatsPerSecond, 9);
    if (i > 0) expect(n.time).toBeGreaterThanOrEqual(m.notes[i - 1].time + m.notes[i - 1].duration - 1e-9);
  }
}

const tune = inTicks(TWINKLE, Q);
const tuneTicks = tune.reduce((s, n) => s + n[1], 0);
/** a triad under every note of the tune, in the same track */
const harmonised = (channel: number): Ev[] => {
  const out: Ev[] = [];
  let tick = 0;
  for (const [midi, ticks] of tune) {
    out.push(...note(tick, ticks, channel, midi - 12), ...note(tick, ticks, channel, midi - 8), ...note(tick, ticks, channel, midi - 5), ...note(tick, ticks, channel, midi));
    tick += ticks;
  }
  return out;
};
/** C, F and G triads, a bar each, below the tune */
const chords = (channel: number): Ev[] => [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]].flatMap((c, bar) => c.flatMap((midi) => note(bar * 4 * Q, 4 * Q, channel, midi)));
const bass = (channel: number): Ev[] => line(channel, [[36, 2 * Q], [43, 2 * Q], [41, 2 * Q], [36, 2 * Q], [41, 2 * Q], [36, 2 * Q], [43, 2 * Q], [36, 2 * Q]]);
const drums = (): Ev[] => Array.from({ length: tuneTicks / Q }, (_, i) => note(i * Q, Q / 4, 9, i % 2 ? 38 : 36)).flat();
const words = (make: (tick: number, s: string) => Ev): Ev[] => {
  let tick = 0;
  return tune.map(([, ticks], i) => {
    const e = make(tick, TWINKLE_WORDS[i]);
    tick += ticks;
    return e;
  });
};

describe("extractMelody", () => {
  test("the highest note of each chord is the tune", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track(harmonised(0))]));
    expect(song.tracks[1].notes).toHaveLength(4 * TWINKLE.length);
    const melody = extractMelody(song.tracks[1]);
    expect(melody.track).toBe(1);
    expect(melody.notes.map((n) => [n.midi, n.beats])).toEqual(TWINKLE);
    expectOneVoice(melody);
  });

  test("a note is cut short where the next one starts, whatever its pitch", () => {
    expect(shape(extractMelody(trackOf([[60, 0, 1], [62, 0.5, 0.5]])))).toEqual([[60, 0, 0.5], [62, 0.5, 0.5]]);
    // a held high note gives way to a lower one that starts under it
    const m = extractMelody(trackOf([[72, 0, 2], [60, 1, 1]]));
    expect(shape(m)).toEqual([[72, 0, 1], [60, 1, 1]]);
    expect(m.notes[0].beats).toBe(2);
    expectOneVoice(m);
  });

  test("a chord rolled within 30 ms is one onset: its top note", () => {
    expect(shape(extractMelody(trackOf([[60, 0, 1], [64, 0.01, 1], [67, 0.02, 1]])))).toEqual([[67, 0.02, 1]]);
    expect(shape(extractMelody(trackOf([[67, 0, 1], [64, 0.01, 1], [60, 0.02, 1]])))).toEqual([[67, 0, 1]]);
  });

  test("a note shorter than 30 ms is dropped, also when the cut made it so", () => {
    // a 10 ms blip between two notes: gone, and the half-second rest it sat in stays a rest
    expect(shape(extractMelody(trackOf([[60, 0, 0.5], [72, 0.7, 0.01], [62, 1, 0.5]])))).toEqual([[60, 0, 0.5], [62, 1, 0.5]]);
    // 64 starts 25 ms after 60 (one onset, 64 on top) and is cut by 62 after 20 ms: dropped
    expect(shape(extractMelody(trackOf([[60, 0, 1], [64, 0.025, 1], [62, 0.045, 1]])))).toEqual([[62, 0.045, 1]]);
  });

  test("a gap shorter than 40 ms is closed by holding the earlier note; a longer one is a rest", () => {
    const m = extractMelody(trackOf([[60, 0, 0.48], [62, 0.5, 0.5], [64, 1.1, 0.5]]));
    expect(shape(m)).toEqual([[60, 0, 0.5], [62, 0.5, 0.5], [64, 1.1, 0.5]]);
    expect(m.notes[0].beats).toBeCloseTo(1, 9);
    expectOneVoice(m);
  });

  test("a cut across a tempo change keeps beats and seconds together", () => {
    // 120 bpm, then 60 bpm from beat 2; the first note is held a beat into the second
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120), tempo(2 * Q, 60)]), track([...note(Q, 3 * Q, 0, 60), ...note(3 * Q, Q, 0, 62)])]));
    const [a, b] = extractMelody(song.tracks[1]).notes;
    // beat 1 to beat 3: one beat at half a second, one at a second
    expect(a).toEqual({ midi: 60, beat: 1, beats: 2, time: 0.5, duration: 1.5, velocity: 96 });
    expect(b).toEqual({ midi: 62, beat: 3, beats: 1, time: 2, duration: 1, velocity: 96 });
  });

  test("the track is left as it was; an empty track gives an empty melody", () => {
    const t = trackOf([[60, 0, 1], [62, 0.5, 0.5]]);
    const before = structuredClone(t);
    extractMelody(t);
    expect(t).toEqual(before);
    expect(extractMelody(trackOf([]))).toEqual({ track: 3, notes: [] });
  });
});

describe("fitRange", () => {
  const twinkle = extractMelody(parseMidi(smf(1, Q, [track([tempo(0, 120), ...line(0, tune)])])).tracks[0]);
  const span = (m: Melody): [number, number] => [Math.min(...m.notes.map((n) => n.midi)), Math.max(...m.notes.map((n) => n.midi))];
  /** a two-note line from `low` to `high` */
  const from = (low: number, high: number): Melody => extractMelody(trackOf([[low, 0, 0.5], [high, 0.5, 0.5]]));

  test("whole octaves, down or up, to the most centred one that fits", () => {
    expect(span(twinkle)).toEqual([60, 69]);
    // into a bass's range: an octave down sits nearer the middle than two
    const down = fitRange(twinkle, 36, 60);
    expect(down.shift).toBe(-12);
    expect(span(down.melody)).toEqual([48, 57]);
    expect(down.melody.notes.map((n) => n.midi - 48)).toEqual(TWINKLE.map((n) => n[0] - 60));
    const up = fitRange(from(40, 50), 60, 84);
    expect(up.shift).toBe(24);
    expect(span(up.melody)).toEqual([64, 74]);
  });

  test("a line that already sits well stays where it is", () => {
    const fit = fitRange(twinkle, 55, 79);
    expect(fit.shift).toBe(0);
    expect(fit.melody).toEqual(twinkle);
    expect(fit.melody).not.toBe(twinkle);
  });

  test("a line that fits may still move an octave to sit nearer the middle", () => {
    // 48..58 in 48..72: at the very bottom as written, nearer the middle an octave up
    expect(fitRange(from(48, 58), 48, 72).shift).toBe(12);
    // equally far from the middle either way: the smaller move
    expect(fitRange(from(48, 60), 48, 72).shift).toBe(0);
  });

  test("semitones only when no octave fits", () => {
    // 60..69 into 62..72: only +2 or +3 fit, equally centred, so the smaller
    const fit = fitRange(twinkle, 62, 72);
    expect(fit.shift).toBe(2);
    expect(span(fit.melody)).toEqual([62, 71]);
  });

  test("a line wider than the range is centred on it and returned anyway", () => {
    const fit = fitRange(from(40, 76), 60, 72);
    expect(fit.shift).toBe(8);
    expect(span(fit.melody)).toEqual([48, 84]);
  });

  test("only the pitch moves; the melody given is left alone; nothing to fit is no shift", () => {
    const before = structuredClone(twinkle);
    const fit = fitRange(twinkle, 36, 60);
    expect(twinkle).toEqual(before);
    expect(fit.melody.notes.map((n) => [n.beat, n.beats, n.time, n.duration, n.velocity])).toEqual(twinkle.notes.map((n) => [n.beat, n.beats, n.time, n.duration, n.velocity]));
    expect(fitRange({ track: 2, notes: [] }, 48, 72)).toEqual({ melody: { track: 2, notes: [] }, shift: 0 });
  });
});

describe("rankMelodyTracks", () => {
  test("the vocal track, over bass, chords and drums", () => {
    const song = parseMidi(
      smf(1, Q, [
        track([trackName("Twinkle"), tempo(0, 120)]),
        track([trackName("Bass"), ...bass(1)]),
        track([trackName("Piano"), ...chords(2)]),
        track([trackName("Drums"), ...drums()]),
        track([trackName("Lead Vocals"), ...line(0, tune)]),
      ]),
    );
    const ranked = rankMelodyTracks(song);
    // never the drums, nor the track with no notes
    expect(ranked.map((r) => r.track).sort()).toEqual([1, 2, 4]);
    expect(ranked[0].track).toBe(4);
    expect(ranked[0].why).toContain('named "Lead Vocals"');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked.find((r) => r.track === 1)?.why).toContain("low, like a bass line");
    expect(ranked.find((r) => r.track === 2)?.why).toContain("mostly chords");
  });

  test("with no names to go by: one note at a time, in a singing range", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track(bass(1)), track(chords(2)), track(drums()), track(line(0, tune))]));
    const ranked = rankMelodyTracks(song);
    expect(ranked.map((r) => r.track)).toHaveLength(3);
    expect(ranked[0].track).toBe(4);
    expect(ranked[0].why).toBe("one note at a time, in a singing range");
    // well clear of the others, not a coin toss
    expect(ranked[0].score - ranked[1].score).toBeGreaterThan(20);
  });

  test("a track with the lyrics on it wins, even one that otherwise looks like a bass", () => {
    const low = inTicks(TWINKLE.map(([m, q]): [number, number] => [m - 24, q]), Q);
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track(line(0, inTicks(FRERE_JACQUES, Q))), track([...line(1, low), ...words(lyric)])]));
    const ranked = rankMelodyTracks(song);
    expect(ranked.map((r) => r.track)).toEqual([2, 1]);
    expect(ranked[0].why).toContain("has the lyrics on its notes");
  });

  test("karaoke words in a track of their own point at the track whose notes they sit on", () => {
    // a descending scale on the off-beats: smoother than the tune, but the words are not on it
    const scale: [number, number][] = [[0, Q / 2], ...[72, 71, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 69, 71, 72].map((m): [number, number] => [m, Q])];
    const tracks = [track([tempo(0, 120)]), track([trackName("Words"), text(0, "@TTwinkle"), ...words(text)]), track(line(0, scale)), track(line(1, tune))];
    const ranked = rankMelodyTracks(parseMidi(smf(1, Q, tracks)));
    expect(ranked.map((r) => r.track)).toEqual([3, 2]);
    expect(ranked[0].why).toContain("its notes line up with the karaoke words");
    // without the words the scale is the better guess: the words are what decides
    const wordless = rankMelodyTracks(parseMidi(smf(1, Q, [tracks[0], track([trackName("Words")]), tracks[2], tracks[3]])));
    expect(wordless.map((r) => r.track)).toEqual([2, 3]);
  });

  test("a format-0 file: the channel that got the lyrics", () => {
    const song = parseMidi(smf(0, Q, [track([tempo(0, 120), ...bass(1), ...chords(2), ...drums(), ...line(5, tune), ...words(lyric)])]));
    expect(song.tracks.map((t) => t.name)).toEqual(["Channel 2", "Channel 3", "Channel 6", "Channel 10"]);
    const ranked = rankMelodyTracks(song);
    expect(ranked[0].track).toBe(2);
    expect(ranked.map((r) => r.track)).not.toContain(3);
  });

  test("drums are never offered, whatever they are called; a song with nothing to sing ranks nothing", () => {
    const song = parseMidi(smf(1, Q, [track([tempo(0, 120)]), track([trackName("Vocals"), ...drums(), lyric(0, "boom")])]));
    expect(song.tracks[1].drums).toBe(true);
    expect(rankMelodyTracks(song)).toEqual([]);
  });
});
