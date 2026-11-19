// "Lamma bada yatathanna" as arranged for Orpheon (src/app/written/lamma.ts). A muwashshah is one
// melody: the men double the women an octave under and the low voices hold drones, so octaves
// moving together are the style here and are not faults; fifths moving together still are. Every
// voice in its range, none under the one below it, every voice's words one to a note, the tune as
// the transcription writes it, and captions in Arabic (drawn right to left) with their meanings.
import { beforeAll, describe, expect, test } from "bun:test";
import { readTune, songById, songTune } from "../../src/app/songs.ts";
import { fitLyrics, ready } from "../../src/lang/index.ts";

beforeAll(async () => {
  await ready("ipa");
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
        if (!x0 || !x1 || !y0 || !y1 || x0.beat + x0.beats < t1 - 1e-9 || y0.beat + y0.beats < t1 - 1e-9) continue;
        if (x0.midi === x1.midi || y0.midi === y1.midi || Math.sign(x1.midi - x0.midi) !== Math.sign(y1.midi - y0.midi)) continue;
        const i0 = (((x0.midi - y0.midi) % 12) + 12) % 12;
        const i1 = (((x1.midi - y1.midi) % 12) + 12) % 12;
        if (i0 === 7 && i1 === 7) out.push(`parallel fifths ${lines[a].name}-${lines[b].name} at ${t1}`);
      }
  }
  return out;
}

describe("Lamma bada yatathanna", () => {
  test("voiced cleanly", () => {
    expect(faults("lamma")).toEqual([]);
  });

  test("every voice's words, one to a note", () => {
    const song = songById("lamma")!;
    for (const v of [{ notes: song.tune, lyrics: song.lyrics }, ...song.voices!.map((x) => ({ notes: x.notes!, lyrics: x.lyrics! }))]) {
      const fit = fitLyrics(songTune({ ...song, tune: v.notes, lyrics: v.lyrics }).notes, v.lyrics, song.lang);
      expect(fit.lines.every((l) => l.how.every((h) => h === "exact"))).toBe(true);
    }
  });

  test("the tune opens as the transcription writes it, in 10/8", () => {
    const song = songById("lamma")!;
    expect(song.meter).toBe(10);
    const first = readTune(song.tune).notes.slice(0, 9).map((n) => [n.midi, n.beats]);
    // la(D) | ma(G, a quarter) ba(A-B flat) da(C-B flat-B flat-A) ya(A) ta(G) than(G-F sharp) na(G, a quarter)
    expect(first).toEqual([[62, 1], [67, 2], [69, 0.5], [70, 0.5], [72, 0.5], [70, 0.5], [70, 0.5], [69, 0.5], [69, 0.5]]);
  });

  test("staged: the soprano alone first, everyone in the last refrain; a band and Arabic captions", () => {
    const song = songById("lamma")!;
    const firsts = song.voices!.map((v) => readTune(v.notes!).notes[0].beat);
    expect(firsts.filter((b) => b === 0).length).toBe(1);
    expect(song.band?.instruments).toEqual(["tanpura", "tabla", "sarod", "esraj"]);
    expect(song.captions!.length).toBe(23);
    for (const c of song.captions!) {
      expect(/[؀-ۿ]/.test(c.text)).toBe(true);
      expect(c.en.length).toBeGreaterThan(0);
    }
  });
});
