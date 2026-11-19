// Ekla chalo re and Danny boy, as arranged for Orpheon (src/app/written/ekla.ts, danny.ts): every
// voice in its range, no voice under the one below it, no parallel fifths or octaves between two
// voices moving together (across a rest nothing moves together), every voice's words one to a
// note, sung without losing a syllable; staged, with a band and captions; the tune as notated.
import { beforeAll, describe, expect, test } from "bun:test";
import { PHONES } from "../../src/contract.ts";
import { PLAYABLE } from "../../src/band/ranges.ts";
import { lineup } from "../../src/app/sing/plan.ts";
import { INITIAL } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";
import { choirLines, readTune, songById, songTune, syllables } from "../../src/app/songs.ts";
import { fitLyrics, ready, sing } from "../../src/lang/index.ts";

beforeAll(async () => {
  await ready("en");
  await ready("ipa");
});

const IDS = ["ekla", "danny"];
const RANGE: Record<string, [number, number]> = { Soprano: [60, 81], Alto: [55, 74], Tenor: [48, 69], Bass: [40, 64] };
const VOWELS = new Set(["i", "y", "ɨ", "ɯ", "u", "ɪ", "ʊ", "e", "ø", "o", "ə", "ɛ", "œ", "ɜ", "ʌ", "ɔ", "æ", "a", "ɑ", "ɒ", "ɚ"]);
const state = (patch: Partial<State>): State => ({ ...INITIAL, mode: "sing", ...patch });

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
        if (i0 === i1 && (i1 === 0 || i1 === 7)) out.push(`parallel ${i1 ? "fifths" : "octaves"} ${lines[a].name}-${lines[b].name} at ${t1}`);
      }
  }
  return out;
}

/** Song beats where a voice sounds, as [from, to) spans. */
const sounding = (notes: string): [number, number][] => readTune(notes).notes.map((n) => [n.beat, n.beat + n.beats]);
const silentIn = (notes: string, from: number, to: number) => sounding(notes).every(([a, b]) => b <= from || a >= to);

describe("the songs as arranged", () => {
  for (const id of IDS) {
    test(`${id}: voiced cleanly`, () => {
      expect(faults(id)).toEqual([]);
    });

    test(`${id}: every voice's words, one to a note, at any tempo`, () => {
      const song = songById(id)!;
      for (const v of [{ notes: song.tune, lyrics: song.lyrics }, ...song.voices!.map((x) => ({ notes: x.notes!, lyrics: x.lyrics! }))]) {
        expect(syllables(v.lyrics)).toHaveLength(readTune(v.notes).notes.length);
        const fit = fitLyrics(songTune({ ...song, tune: v.notes, lyrics: v.lyrics }).notes, v.lyrics, song.lang);
        expect(fit.lines.every((l) => l.how.every((h) => h === "exact"))).toBe(true);
      }
      for (const tempo of [0.5, 1, 2]) {
        for (const line of choirLines(song, { transpose: 0, tempo })) {
          const fit = fitLyrics(line.notes, line.lyrics!, song.lang);
          expect(fit.la).toBe(0);
          expect(fit.leftOver).toBe(0);
        }
      }
    });

    test(`${id}: sung, every voice keeps every syllable, every sound one the voice has`, () => {
      const song = songById(id)!;
      for (const line of lineup(state({ song: id }))!.lines) {
        const score = sing(line.notes, line.lyrics, { lang: song.lang, transpose: 0 });
        for (const p of score.phones) expect(PHONES).toContain(p.ph);
        const units = syllables(line.lyrics);
        const starts = line.notes.filter((_, k) => units[k] !== "_").map((n) => n.t);
        const landed = starts.filter((t) => score.phones.some((p) => VOWELS.has(p.ph) && Math.abs(p.t - t) < 1e-6));
        expect(landed.length).toBe(starts.length);
      }
    });

    test(`${id}: staged (one voice first, everyone by the end), a band of four or more, captions line by line`, () => {
      const song = songById(id)!;
      const firsts = song.voices!.map((v) => readTune(v.notes!).notes[0].beat);
      expect(Math.min(...firsts)).toBe(0);
      expect(firsts.filter((b) => b === 0).length).toBe(1);
      expect(song.band?.instruments.length).toBeGreaterThanOrEqual(4);
      expect(song.captions!.length).toBeGreaterThan(8);
      // in Bengali each line has its meaning under it; Danny boy is in English already
      for (const c of song.captions!) expect(c.en.length > 5).toBe(song.lang === "ipa");
      const lu = lineup(state({ song: id }))!;
      expect(lu.band.map((p) => p.instrument)).toEqual(song.band!.instruments);
      for (const part of lu.band) {
        const [lo, hi] = PLAYABLE[part.instrument];
        for (const n of part.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(lo);
          expect(n.midi).toBeLessThanOrEqual(hi);
          expect(n.d).toBeGreaterThan(0);
        }
      }
      // between one and a half and three minutes, the band's introduction included
      const end = Math.max(...lu.lines.map((l) => l.notes.at(-1)!.t + l.notes.at(-1)!.d));
      expect(end).toBeGreaterThan(90);
      expect(end).toBeLessThan(180);
    });
  }
});

describe("the tunes as notated", () => {
  test("Ekla chalo re: the refrain from its upbeat, the sharp seventh below and the flat one above", () => {
    const song = songById("ekla")!;
    expect(readTune(song.tune).notes.slice(0, 10).map((n) => n.midi)).toEqual([63, 63, 63, 64, 64, 66, 66, 69, 71, 69]);
    const pitches = new Set(readTune(song.tune).notes.map((n) => n.midi % 12));
    expect(pitches.has(3) && pitches.has(2)).toBe(true);
  });

  test("Ekla chalo re: the tenor alone, the bass under him, then the whole choir on “ekla cholo”", () => {
    const [soprano, alto, tenor, bass] = songById("ekla")!.voices!.map((v) => v.notes!);
    expect(sounding(tenor)[0][0]).toBe(0);
    expect(sounding(bass)[0][0]).toBe(30);
    expect(sounding(soprano)[0][0]).toBe(62);
    expect(sounding(alto)[0][0]).toBe(62);
  });

  test("Danny boy: the Londonderry air from its upbeat, the tenor alone, the choir from “But come ye back”", () => {
    const song = songById("danny")!;
    // Oh Dan-ny boy, the pipes, the pipes are
    expect(readTune(song.tune).notes.slice(0, 9).map((n) => n.midi)).toEqual([62, 63, 65, 67, 65, 67, 72, 70, 67]);
    const [soprano, alto, tenor, bass] = song.voices!.map((v) => v.notes!);
    expect(sounding(tenor)[0][0]).toBe(0);
    for (const v of [soprano, alto, bass]) expect(sounding(v)[0][0]).toBe(32);
    // the women alone for the second verse's first half
    expect(silentIn(tenor, 64, 95.5) && silentIn(bass, 64, 95.5)).toBe(true);
    // the top of the tune, "here", is the climax's highest note
    expect(Math.max(...readTune(soprano).notes.map((n) => n.midi))).toBe(79);
  });
});
