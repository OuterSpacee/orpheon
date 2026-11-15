// The two songs written out whole (src/app/written/): the same four parts, notes, words, band and
// captions as the arrangements they were ported from, sung without losing a syllable.
import { describe, expect, test } from "bun:test";
import { PHONES } from "../../src/contract.ts";
import type { InstrumentId } from "../../src/contract.ts";
import { PLAYABLE } from "../../src/band/ranges.ts";
import { fitLyrics, sing } from "../../src/lang/index.ts";
import { lineup, performance, suggestedFor } from "../../src/app/sing/plan.ts";
import { setupPatch } from "../../src/app/sing/setup.ts";
import { LEAD_IN, SONGS, choirLines, readTune, syllables } from "../../src/app/songs.ts";
import { INITIAL } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";

const state = (patch: Partial<State>): State => ({ ...INITIAL, mode: "sing", ...patch });
const song = (id: string) => SONGS.find((s) => s.id === id)!;
const VOWELS = new Set(["i", "y", "ɨ", "ɯ", "u", "ɪ", "ʊ", "e", "ø", "o", "ə", "ɛ", "œ", "ɜ", "ʌ", "ɔ", "æ", "a", "ɑ", "ɒ", "ɚ"]);

/** What the arrangements they were ported from have: length in beats, tempo, introduction, the band's notes per instrument, caption lines. */
const REFERENCE: Record<string, { beats: number; bpm: number; intro: number; band: Partial<Record<InstrumentId, number>>; captions: number; lastBar: number; final: number[] }> = {
  // tanpura 229, sarod 310, esraj 96, tabla 352 notes; the last chord F2 C3... held nine beats
  anandaloke: { beats: 219, bpm: 116, intro: 12, band: { tanpura: 229, sarod: 310, esraj: 96, tabla: 352 }, captions: 9, lastBar: 3, final: [65, 60, 57, 41] },
  // harp 325, bass 78, strings 207, timpani 32 notes; the last chord held four beats past its bar
  freude: { beats: 162, bpm: 108, intro: 8, band: { harp: 325, bass: 78, strings: 207, timpani: 32 }, captions: 20, lastBar: 2, final: [67, 62, 59, 43] },
};

/** Song beats where each voice sounds, as [from, to) spans. */
function sounding(notes: string): [number, number][] {
  return readTune(notes).notes.map((n) => [n.beat, n.beat + n.beats]);
}
const silentIn = (notes: string, from: number, to: number) => sounding(notes).every(([a, b]) => b <= from || a >= to);

for (const id of Object.keys(REFERENCE)) {
  const ref = REFERENCE[id];
  const written = song(id);

  describe(written.title, () => {
    test("four voices, two female and two male, each in its own body", () => {
      expect(written.voices!.map((v) => v.name)).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
      expect(choirLines(written, { transpose: 0, tempo: 1 }).map((l) => l.body)).toEqual([1, 2, 3, 4]);
      expect(written.lang).toBe("ipa");
      expect(written.bpm).toBe(ref.bpm);
      expect(written.intro).toBe(ref.intro);
      expect(written.credit).toMatch(/written for Orpheon/);
    });

    test("every voice runs the song's length in whole bars, and ends on the held chord", () => {
      for (const voice of [{ notes: written.tune }, ...written.voices!]) {
        const t = readTune(voice.notes!);
        expect(t.beats).toBe(ref.beats);
        for (const bar of t.bars.slice(0, -1)) expect(bar).toBe(written.meter);
        expect(t.bars[t.bars.length - 1]).toBe(ref.lastBar);
      }
      const last = written.voices!.map((v) => readTune(v.notes!).notes.at(-1)!);
      expect(last.map((n) => n.midi)).toEqual(ref.final);
      for (const n of last) expect(n.beat + n.beats).toBe(ref.beats);
    });

    test("each voice has a syllable or a held one for every note of its own", () => {
      for (const voice of [{ notes: written.tune, lyrics: written.lyrics }, ...written.voices!]) {
        const units = syllables(voice.lyrics!);
        expect(units).toHaveLength(readTune(voice.notes!).notes.length);
        expect(units[0]).not.toBe("_");
      }
    });

    test("the words fit one to a note at any tempo: no syllable bent, shared, dropped or sung on la", () => {
      for (const tempo of [0.5, 1, 2]) {
        const lines = choirLines(written, { transpose: 0, tempo });
        const solo = lineup(state({ song: id, tempo, setups: { [id]: { choir: false } } }))!.lines[0];
        // and the tune on the page's roll, which the page fits the song's words to
        const roll = { notes: lineup(state({ song: id, tempo }))!.notes, lyrics: written.lyrics };
        for (const line of [...lines, solo, roll]) {
          const fit = fitLyrics(line.notes, line.lyrics!, "ipa");
          expect(fit.la).toBe(0);
          expect(fit.leftOver).toBe(0);
          for (const n of fit.notes) expect(n.kind === "sung" || (n.kind === "held" && n.marked)).toBe(true);
        }
      }
    });

    test("sung, every voice keeps every syllable: a vowel lands on each syllable's note, every sound one the voice has", () => {
      for (const line of lineup(state({ song: id }))!.lines) {
        const score = sing(line.notes, line.lyrics, { lang: "ipa", transpose: 0 });
        expect(score.phones.length).toBeGreaterThan(0);
        for (const p of score.phones) expect(PHONES).toContain(p.ph);
        // the notes that start a syllable (a "_" carries the one before on)
        const units = syllables(line.lyrics);
        const starts = line.notes.filter((_, k) => units[k] !== "_").map((n) => n.t);
        const landed = starts.filter((t) => score.phones.some((p) => VOWELS.has(p.ph) && Math.abs(p.t - t) < 1e-6));
        expect(landed.length).toBe(starts.length);
      }
    });

    test("a breath where a phrase ends: the voice is silent a moment before the next phrase", () => {
      const lines = choirLines(written, { transpose: 0, tempo: 1 });
      lines.forEach((line, i) => {
        const phrases = written.voices![i].lyrics!.split("\n");
        let at = 0;
        for (const phrase of phrases.slice(0, -1)) {
          at += syllables(phrase).length;
          const gap = line.notes[at].t - (line.notes[at - 1].t + line.notes[at - 1].d);
          expect(gap).toBeGreaterThanOrEqual(0.12);
        }
      });
    });

    test("its own band, note for note, with the song's instruments ticked", () => {
      const s = state({ song: id });
      const lu = lineup(s)!;
      expect(suggestedFor(s, lu.notes)).toEqual(written.band!.instruments);
      const counts = Object.fromEntries(lu.band.map((part) => [part.instrument, part.notes.length]));
      expect(counts).toEqual(ref.band);
      for (const part of lu.band) {
        const [lo, hi] = PLAYABLE[part.instrument];
        for (const n of part.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(lo);
          expect(n.midi).toBeLessThanOrEqual(hi);
          expect(n.d).toBeGreaterThan(0);
        }
        part.notes.forEach((n, k) => k > 0 && expect(n.t).toBeGreaterThanOrEqual(part.notes[k - 1].t));
      }
      // the band opens after the lead-in; the voices come in after its introduction
      const beat = 60 / ref.bpm;
      expect(Math.min(...lu.band.map((p) => p.notes[0].t))).toBeCloseTo(LEAD_IN, 6);
      const first = Math.min(...lu.lines.map((l) => l.notes[0].t));
      expect(first).toBeCloseTo(LEAD_IN + ref.intro * beat, 6);
    });

    test("the transpose and tempo controls move the band with the voices (the tabla keeps its strokes)", () => {
      const plain = lineup(state({ song: id }))!;
      const moved = lineup(state({ song: id, transpose: 2, tempo: 2 }))!;
      moved.band.forEach((part, i) => {
        const was = plain.band[i];
        expect(part.notes).toHaveLength(was.notes.length);
        part.notes.forEach((n, k) => {
          expect(n.midi).toBe(was.notes[k].midi + (part.instrument === "tabla" ? 0 : 2));
          // the last chord's roll is a gesture of the hand, its strings a few hundredths of a second apart at any tempo
          const rolled = (part.instrument === "harp" || part.instrument === "sarod") && k >= part.notes.length - 9;
          expect(Math.abs(n.t - LEAD_IN - (was.notes[k].t - LEAD_IN) / 2)).toBeLessThan(rolled ? 0.4 : 1e-6);
        });
      });
      expect(moved.lines[0].notes[0].midi).toBe(plain.lines[0].notes[0].midi + 2);
      expect(moved.lines[0].notes[0].t - LEAD_IN).toBeCloseTo((plain.lines[0].notes[0].t - LEAD_IN) / 2, 6);
    });

    test("without its band the voices start after the lead-in, and an instrument ticked alone still plays", () => {
      const s = state({ song: id });
      const off = { ...s, ...setupPatch(s, { band: false }) };
      const lu = lineup(off)!;
      expect(lu.band).toEqual([]);
      expect(Math.min(...lu.lines.map((l) => l.notes[0].t))).toBeCloseTo(LEAD_IN, 6);
      expect(lu.captions![0].t0).toBeGreaterThanOrEqual(LEAD_IN - 1e-9);
      const one = written.band!.instruments[0];
      const alone = lineup({ ...s, ...setupPatch(s, { instruments: [one] }) })!;
      expect(alone.band.map((p) => p.instrument)).toEqual([one]);
    });

    test("captions: each line in its own script and in English, in order, lit syllable by syllable as the voices sing them", () => {
      const s = state({ song: id });
      const lu = lineup(s)!;
      const captions = lu.captions!;
      expect(captions).toHaveLength(ref.captions);
      expect(performance(lu, s).performance.captions).toEqual(captions);
      const starts = lu.lines.flatMap((l) => l.notes.map((n) => n.t));
      captions.forEach((c, i) => {
        expect(c.syl.map(([, text]) => text).join("")).toBe(c.text);
        expect(c.text).not.toContain("·");
        expect(c.en.length).toBeGreaterThan(5);
        expect(c.t0).toBe(c.syl[0][0]);
        expect(c.t1).toBeGreaterThan(c.t0);
        if (i > 0) expect(c.t0).toBe(captions[i - 1].t1);
        c.syl.forEach(([t], k) => {
          if (k > 0) expect(t).toBeGreaterThan(c.syl[k - 1][0]);
          expect(t).toBeLessThan(c.t1);
          // a piece lights when some voice starts its syllable
          expect(starts.some((x) => Math.abs(x - t) < 1e-6)).toBe(true);
        });
      });
      // the last line lasts to the end of the held chord
      const end = Math.max(...lu.lines.map((l) => l.notes.at(-1)!.t + l.notes.at(-1)!.d));
      expect(captions.at(-1)!.t1).toBeCloseTo(end, 6);
      // words the person types replace the song's own, and its captions with them
      expect(lineup({ ...s, lyrics: "la la la" })!.captions).toBeUndefined();
    });
  });
}

describe("the entries and rests, as written", () => {
  test("Anandaloke: the soprano alone, the alto under her, then the tenor, then the bass; the men's line, then the women's", () => {
    const [soprano, alto, tenor, bass] = song("anandaloke").voices!.map((v) => v.notes!);
    expect(sounding(soprano)[0][0]).toBe(0);
    expect(sounding(alto)[0][0]).toBe(24);
    expect(sounding(tenor)[0][0]).toBe(48);
    expect(sounding(bass)[0][0]).toBe(72);
    // the verse's first line: the men alone (beats 96..120), then the women alone (120..144)
    expect(silentIn(soprano, 96, 120) && silentIn(alto, 96, 120)).toBe(true);
    expect(silentIn(tenor, 120, 144) && silentIn(bass, 120, 144)).toBe(true);
    // the tune: A4 A4 A4, a grace note G4 into A4, G4
    expect(readTune(soprano).notes.slice(0, 6).map((n) => n.midi)).toEqual([69, 69, 69, 67, 69, 67]);
  });

  test("Freude: the bass alone with the tune, then the tenor, the alto, and the soprano on “Alle Menschen”", () => {
    const [soprano, alto, tenor, bass] = song("freude").voices!.map((v) => v.notes!);
    expect(sounding(bass)[0][0]).toBe(0);
    expect(sounding(tenor)[0][0]).toBe(16);
    expect(sounding(alto)[0][0]).toBe(32);
    expect(sounding(soprano)[0][0]).toBe(47);
    expect(song("freude").voices![0].lyrics!.startsWith("ˈa-.lə ˈmɛn-.ʃən")).toBe(true);
    // the theme: B B C D D C B A
    expect(readTune(bass).notes.slice(0, 8).map((n) => n.midi)).toEqual([47, 47, 48, 50, 50, 48, 47, 45]);
  });
});
