// An imported multi-track file with a band: tracks whose General MIDI family the band has are
// played by it, the rest sung, and each track's use can be changed.
import { describe, expect, test } from "bun:test";
import { PLAYABLE } from "../../src/band/ranges.ts";
import { fileArrangement, instrumentFor, planTracks } from "../../src/lang/acappella.ts";
import { importSong, ready } from "../../src/lang/index.ts";
import { problems } from "./check.ts";
import { inTicks, line, note, program, smf, tempo, track, trackName, TWINKLE } from "./smf.ts";

await ready("en");

const Q = 480;
const bass = line(1, [[36, 2 * Q], [43, 2 * Q], [41, 2 * Q], [36, 2 * Q], [41, 2 * Q], [36, 2 * Q], [43, 2 * Q], [36, 2 * Q]]);
const strings = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]].flatMap((c, bar) => c.flatMap((m) => note(bar * 4 * Q, 4 * Q, 2, m)));
const horn = line(3, [[55, 4 * Q], [57, 4 * Q], [55, 4 * Q], [55, 4 * Q]]);
// a conga (63) too: the kit has none, so it becomes a tom
const drums = Array.from({ length: 16 }, (_, beat) => [...note(beat * Q, Q / 4, 9, beat % 2 ? 38 : 36), ...note(beat * Q + Q / 2, Q / 8, 9, beat === 15 ? 63 : 42)]).flat();
const bytes = smf(1, Q, [
  track([trackName("Song"), tempo(0, 120)]),
  track([trackName("Lead Vocals"), ...line(0, inTicks(TWINKLE, Q))]),
  track([trackName("Bass"), program(0, 1, 33), ...bass]),
  track([trackName("Strings"), program(0, 2, 48), ...strings]),
  track([trackName("Horn"), program(0, 3, 60), ...horn]),
  track([trackName("Drums"), ...drums]),
]);
const song = importSong(bytes);

describe("a file with a band", () => {
  test("General MIDI families map onto the band", () => {
    expect(instrumentFor(0)).toBe("piano");
    expect(instrumentFor(25)).toBe("guitar");
    expect(instrumentFor(33)).toBe("bass");
    expect(instrumentFor(40)).toBe("strings");
    expect(instrumentFor(46)).toBe("harp");
    expect(instrumentFor(47)).toBe("timpani");
    expect(instrumentFor(73)).toBe("flute");
    expect(instrumentFor(104)).toBe("tanpura");
    expect(instrumentFor(53)).toBeNull(); // voice oohs: sung
    expect(instrumentFor(60)).toBeNull(); // horn: the band has none
    expect(instrumentFor(null, true)).toBe("kit");
  });

  test("by default the band plays its own instruments' tracks and the voices sing the rest", () => {
    const plan = planTracks(song);
    expect(plan.map((t) => [t.name, t.use])).toEqual([
      ["Lead Vocals", "sung"],
      ["Bass", "bass"],
      ["Strings", "strings"],
      ["Horn", "sung"],
      ["Drums", "kit"],
    ]);
    expect(plan.find((t) => t.name === "Bass")?.options).toEqual(["bass", "sung", "out"]);
    const a = fileArrangement(song);
    expect(a.parts.map((p) => p.role)).toEqual(["tune", "pad"]);
    expect(a.band.map((b) => b.instrument)).toEqual(["bass", "strings", "kit"]);
    expect(a.band[0].name).toContain("Bass");
    for (const p of a.parts) expect(problems(p.score)).toEqual([]);
  });

  test("the band's notes are the file's, on the song's clock, inside each instrument's range", () => {
    const a = fileArrangement(song);
    const tune = a.parts[0].score;
    expect(tune.phones.length).toBeGreaterThan(10);
    const strings = a.band.find((b) => b.instrument === "strings")!;
    expect(strings.notes.length).toBe(12);
    // the first chord starts with the first note of the tune
    expect(strings.notes[0].t).toBeCloseTo(song.notes[0].t, 6);
    for (const part of a.band) {
      const [lo, hi] = PLAYABLE[part.instrument];
      for (const n of part.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(lo);
        expect(n.midi).toBeLessThanOrEqual(hi);
        expect(n.velocity).toBeGreaterThan(0);
      }
    }
    expect(a.band.find((b) => b.instrument === "kit")!.notes.some((n) => n.midi === 45 || n.midi === 48)).toBe(true);
  });

  test("a track's use can be changed: sung, played, or left out", () => {
    const a = fileArrangement(song, { choices: { 2: "sung", 3: "out", 5: "sung" } });
    expect(a.tracks.map((t) => t.use)).toEqual(["sung", "sung", "out", "sung", "sung"]);
    expect(a.band).toEqual([]);
    expect(a.parts.map((p) => p.role).sort()).toEqual(["bass", "drums", "pad", "tune"]);
  });
});
