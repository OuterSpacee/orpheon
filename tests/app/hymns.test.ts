// Amazing grace and Adeste fideles, as arranged for Orpheon (src/app/written/grace.ts, adeste.ts):
// every voice in its range, no voice under the one below it, no parallel fifths or octaves between
// two voices moving together (across a rest nothing moves together), every line's words one to a note.
import { beforeAll, describe, expect, test } from "bun:test";
import { readTune, songById, songTune } from "../../src/app/songs.ts";
import { fitLyrics, ready } from "../../src/lang/index.ts";

beforeAll(async () => {
  await ready("en");
});

const RANGE: Record<string, [number, number]> = { Soprano: [60, 81], Alto: [55, 74], Tenor: [48, 69], Bass: [40, 64] };

function faults(id: string): string[] {
  const song = songById(id)!;
  const lines = song.voices!.map((v) => ({ name: v.name, notes: readTune(v.notes!).notes }));
  const note = (notes: { beat: number; beats: number; midi: number }[], t: number) => notes.find((n) => t >= n.beat - 1e-9 && t < n.beat + n.beats - 1e-9);
  const times = [...new Set(lines.flatMap((l) => l.notes.map((n) => n.beat)))].sort((a, b) => a - b);
  const out: string[] = [];
  for (const l of lines) for (const n of l.notes) if (n.midi < RANGE[l.name][0] || n.midi > RANGE[l.name][1]) out.push(`${l.name} out of range at ${n.beat}`);
  for (let i = 1; i < times.length; i++) {
    const [t0, t1] = [times[i - 1], times[i]];
    for (let a = 0; a < lines.length; a++)
      for (let b = a + 1; b < lines.length; b++) {
        const [x0, x1, y0, y1] = [note(lines[a].notes, t0), note(lines[a].notes, t1), note(lines[b].notes, t0), note(lines[b].notes, t1)];
        if (x1 && y1 && x1.midi < y1.midi) out.push(`${lines[a].name} under ${lines[b].name} at ${t1}`);
        // moving together: both sounding at t0 and held up to t1 (no rest between), both moving the same way
        if (!x0 || !x1 || !y0 || !y1 || x0.beat + x0.beats < t1 - 1e-9 || y0.beat + y0.beats < t1 - 1e-9) continue;
        if (x0.midi === x1.midi || y0.midi === y1.midi || Math.sign(x1.midi - x0.midi) !== Math.sign(y1.midi - y0.midi)) continue;
        const i0 = (((x0.midi - y0.midi) % 12) + 12) % 12;
        const i1 = (((x1.midi - y1.midi) % 12) + 12) % 12;
        if (i0 === i1 && (i1 === 0 || i1 === 7)) out.push(`parallel ${i1 ? "fifths" : "octaves"} ${lines[a].name}-${lines[b].name} at ${t1}`);
      }
  }
  return out;
}

describe("the hymns as arranged", () => {
  for (const id of ["grace", "adeste", "wellerman"]) {
    test(`${id}: voiced cleanly`, () => {
      expect(faults(id)).toEqual([]);
    });
    test(`${id}: every voice's words, one to a note`, () => {
      const song = songById(id)!;
      for (const v of [{ notes: song.tune, lyrics: song.lyrics }, ...song.voices!.map((x) => ({ notes: x.notes!, lyrics: x.lyrics! }))]) {
        const fit = fitLyrics(songTune({ ...song, tune: v.notes, lyrics: v.lyrics }).notes, v.lyrics, song.lang);
        expect(fit.lines.every((l) => l.how.every((h) => h === "exact"))).toBe(true);
      }
    });
  }
  test("they are staged: one voice first, everyone by the end", () => {
    for (const id of ["grace", "adeste", "wellerman"]) {
      const song = songById(id)!;
      const firsts = song.voices!.map((v) => readTune(v.notes!).notes[0].beat);
      expect(Math.min(...firsts)).toBe(0);
      expect(firsts.filter((b) => b === 0).length).toBe(1);
      expect(song.band?.instruments.length).toBeGreaterThanOrEqual(4);
      expect(song.captions?.length).toBeGreaterThan(8);
    }
  });
});
