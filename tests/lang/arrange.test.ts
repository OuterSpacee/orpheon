// The arranger on every built-in song: the key, beat and bar it hears, chords that hold the
// melody's strong notes, parts that keep the voice-leading rules (checked mechanically), and a
// band that stays inside each instrument's range.
import "../fixtures/plain-songs.ts";
import { describe, expect, test } from "bun:test";
import { INSTRUMENTS, type InstrumentId } from "../../src/contract.ts";
import { PLAYABLE } from "../../src/band/ranges.ts";
import { SONGS, songTune, timed } from "../../src/app/songs.ts";
import { analyse, arrange, suggestBand } from "../../src/lang/arrange.ts";
import { chordAt, keyName, pc } from "../../src/lang/harmony.ts";
import { RANGES, voiceLeadingProblems } from "../../src/lang/voicing.ts";
import { fitLyrics, ready } from "../../src/lang/index.ts";

await ready("en");

const ALL = INSTRUMENTS.map((i) => i.id) as InstrumentId[];
/** The songs the arranger arranges: one written out whole (src/app/written/) is sung and played as written. */
const ARRANGED = SONGS.filter((s) => !s.band);
const tuneOf = (id: string) => {
  const song = SONGS.find((s) => s.id === id)!;
  const t = songTune(song);
  return { song, notes: timed(t.notes), lyrics: t.lyrics };
};

describe("analyse", () => {
  const KEYS: Record<string, string> = { twinkle: "C major", joy: "C major", "plain-grace": "G major", "plain-adeste": "G major", jacques: "F major", old100: "G major" };
  // beats of pickup before the first downbeat
  const PICKUP: Record<string, number> = { twinkle: 0, joy: 0, "plain-grace": 1, "plain-adeste": 1, jacques: 0, old100: 0 };

  for (const song of ARRANGED) {
    test(`${song.id}: key, tempo, meter and downbeat`, () => {
      const { notes } = tuneOf(song.id);
      const a = analyse(notes);
      expect(keyName({ tonic: a.key.tonic, mode: a.key.mode })).toBe(KEYS[song.id]);
      expect(Math.abs(a.tempo / song.bpm - 1)).toBeLessThan(0.02);
      expect(a.meter).toBe(song.meter);
      expect((a.downbeat - notes[0].t) / a.beat).toBeCloseTo(PICKUP[song.id], 1);
    });

    test(`${song.id}: every chord on a downbeat holds the melody's note there`, () => {
      const { notes } = tuneOf(song.id);
      const a = analyse(notes);
      let strong = 0;
      for (const n of notes) {
        const k = (n.t - a.downbeat) / a.beat;
        if (Math.abs(k - Math.round(k)) > 0.05 || ((Math.round(k) % a.meter) + a.meter) % a.meter !== 0) continue;
        strong++;
        expect(chordAt(a.chords, n.t + 1e-4).tones).toContain(pc(n.midi));
      }
      expect(strong).toBeGreaterThan(8);
      // and the song ends on its tonic chord
      expect(a.chords[a.chords.length - 1].root).toBe(a.key.tonic);
    });
  }

  test("a minor tune is heard in minor", () => {
    // "Greensleeves"-like opening in A minor, written for this test: A C D E F E D B G A B C A
    const pitches = [57, 60, 62, 64, 65, 64, 62, 59, 55, 57, 59, 60, 57, 57, 56, 57];
    const notes = pitches.map((midi, i) => ({ t: 0.4 + i * 0.5, d: 0.5, midi }));
    const a = analyse(notes);
    expect(a.key).toEqual({ tonic: 9, mode: "minor" });
  });

  test("any tune at all: short, odd, random; never a throw, never a part out of range", () => {
    let seed = 11;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const tunes = [
      [{ t: 0.4, d: 1, midi: 60 }],
      [{ t: 0.4, d: 0.5, midi: 60 }, { t: 0.9, d: 0.5, midi: 67 }],
      // a tune that leaps about over two octaves, with rests and odd lengths
      Array.from({ length: 60 }, (_, i) => ({ t: 0.4 + i * 0.37 + (i % 7 === 0 ? 0.5 : 0), d: 0.2 + 0.5 * random(), midi: 48 + Math.floor(random() * 30) })),
      // and one in a minor key at a fast tempo
      Array.from({ length: 40 }, (_, i) => ({ t: 0.4 + i * 0.25, d: 0.25, midi: 57 + [0, 2, 3, 5, 7, 8, 11, 12][Math.floor(random() * 8)] })),
    ];
    for (const notes of tunes) {
      for (const style of ["hymn", "oohs", "round"] as const) {
        const a = arrange(notes, { voices: 6, style, band: ALL, lyrics: "la la la" });
        expect(a.voices.length).toBeGreaterThan(0);
        for (const part of a.band) for (const n of part.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(PLAYABLE[part.instrument][0]);
          expect(n.midi).toBeLessThanOrEqual(PLAYABLE[part.instrument][1]);
          expect(Number.isFinite(n.t) && Number.isFinite(n.d)).toBe(true);
        }
        for (const v of a.voices) for (const n of v.notes) expect(Number.isFinite(n.midi)).toBe(true);
      }
    }
  });

  test("nothing in, a sensible nothing out", () => {
    const a = analyse([]);
    expect(a.chords).toEqual([]);
    expect(arrange([], { voices: 4 }).voices).toEqual([]);
  });
});

describe("arrange: the choir", () => {
  for (const song of ARRANGED) {
    for (const style of ["hymn", "oohs"] as const) {
      for (const voices of [3, 4, 5]) {
        test(`${song.id}, ${style}, ${voices} voices: no crossing, no parallel fifths or octaves, every part in range`, () => {
          const { notes, lyrics } = tuneOf(song.id);
          const a = arrange(notes, { voices, style, lyrics, band: [] });
          expect(a.voices.length).toBe(voices);
          expect(a.voices.filter((v) => v.tune).length).toBe(1);
          const parts = a.voices.filter((v) => v.part !== "double");
          expect(voiceLeadingProblems(parts.map((v) => ({ name: v.name, notes: v.notes })))).toEqual([]);
          for (const v of parts) {
            const [lo, hi] = RANGES[v.part as keyof typeof RANGES];
            for (const n of v.notes) {
              expect(n.midi).toBeGreaterThanOrEqual(lo);
              expect(n.midi).toBeLessThanOrEqual(hi);
            }
          }
        });
      }
    }
  }

  test("inner voices move by step and keep common tones", () => {
    let moves = 0;
    let steps = 0;
    let shared = 0;
    let kept = 0;
    for (const song of ARRANGED) {
      const { notes, lyrics } = tuneOf(song.id);
      const a = arrange(notes, { voices: 4, style: "hymn", lyrics, band: [] });
      for (const v of a.voices.filter((x) => x.part === "alto" || x.part === "tenor")) {
        for (let i = 1; i < v.notes.length; i++) {
          const before = v.notes[i - 1];
          const now = v.notes[i];
          if (now.t - (before.t + before.d) > 0.1) continue;
          const leap = Math.abs(now.midi - before.midi);
          expect(leap).toBeLessThanOrEqual(5);
          moves++;
          if (leap <= 2) steps++;
          // where the chord changes and the old note belongs to the new chord, it is a common tone
          const c0 = chordAt(a.analysis.chords, before.t + 1e-4);
          const c1 = chordAt(a.analysis.chords, now.t + 1e-4);
          if (c0 !== c1 && c1.tones.includes(pc(before.midi))) {
            shared++;
            if (now.midi === before.midi) kept++;
          }
        }
      }
    }
    expect(steps / moves).toBeGreaterThan(0.85);
    expect(kept / shared).toBeGreaterThan(0.6);
  });

  test("hymn lines sing the words note for note with the tune", () => {
    const { notes, lyrics } = tuneOf("plain-adeste");
    const a = arrange(notes, { voices: 4, style: "hymn", lyrics, band: [] });
    const tuneFit = fitLyrics(a.voices[0].notes, lyrics, "la").notes.map((n) => n.text.join("|"));
    for (const v of a.voices) {
      expect(v.lyrics).toBe(lyrics);
      expect(v.notes.map((n) => n.t)).toEqual(a.voices[0].notes.map((n) => n.t));
      expect(fitLyrics(v.notes, v.lyrics, "la").notes.map((n) => n.text.join("|"))).toEqual(tuneFit);
    }
  });

  test("oohs: one syllable for every note, held across the harmony", () => {
    const { notes, lyrics } = tuneOf("plain-grace");
    const a = arrange(notes, { voices: 4, style: "oohs", lyrics, band: [] });
    for (const v of a.voices.filter((x) => !x.tune)) {
      const syllables = v.lyrics.split(/\s+/).filter(Boolean);
      expect(syllables.length).toBe(v.notes.length);
      expect(new Set(syllables).size).toBe(1);
      expect(["ooh", "ah"]).toContain(syllables[0]);
      // fewer, longer notes than the tune
      expect(v.notes.length).toBeLessThan(a.voices[0].notes.length / 2);
    }
  });

  test("a round where the tune allows one, a hymn (and the reason) where it does not", () => {
    const jacques = tuneOf("jacques");
    const round = arrange(jacques.notes, { voices: 4, style: "round", lyrics: jacques.lyrics, band: [] });
    expect(round.style).toBe("round");
    expect(round.round?.works).toBe(true);
    expect(round.round?.distance).toBe(8);
    const entries = round.voices.map((v) => v.notes[0].t - round.voices[0].notes[0].t);
    expect(entries.map((e) => Math.round(e / round.analysis.beat))).toEqual([0, 8, 16, 24]);

    const twinkle = tuneOf("twinkle");
    const hymn = arrange(twinkle.notes, { voices: 4, style: "round", lyrics: twinkle.lyrics, band: [] });
    expect(hymn.style).toBe("hymn");
    expect(hymn.round?.works).toBe(false);
    expect(hymn.round?.why).toContain("hymn");
  });

  test("one voice sings the tune alone; six add a descant and double the tune", () => {
    const { notes, lyrics } = tuneOf("old100");
    expect(arrange(notes, { voices: 1, lyrics }).voices.map((v) => v.part)).toEqual(["soprano"]);
    expect(arrange(notes, { voices: 6, lyrics, band: [] }).voices.map((v) => v.part)).toEqual(["descant", "soprano", "alto", "tenor", "bass", "double"]);
  });
});

describe("arrange: the band", () => {
  for (const song of ARRANGED) {
    for (const style of ["hymn", "round"] as const) {
      test(`${song.id} (${style}): every instrument's notes inside its range, in time, not empty`, () => {
        const { notes, lyrics } = tuneOf(song.id);
        const a = arrange(notes, { voices: 4, style, lyrics, band: ALL });
        expect(a.band.map((p) => p.instrument).sort()).toEqual([...ALL].sort());
        const end = Math.max(...a.voices.flatMap((v) => v.notes.map((n) => n.t + n.d)));
        for (const part of a.band) {
          const [lo, hi] = PLAYABLE[part.instrument];
          // the flute only answers the tune where it rests (and doubles a last verse): in a hymn
          // of two phrases that can be a single run
          expect(part.notes.length).toBeGreaterThan(part.instrument === "flute" ? 0 : 4);
          for (const n of part.notes) {
            expect(n.midi).toBeGreaterThanOrEqual(lo);
            expect(n.midi).toBeLessThanOrEqual(hi);
            expect(n.d).toBeGreaterThan(0);
            expect(n.t).toBeGreaterThanOrEqual(0);
            expect(n.t).toBeLessThan(end + 0.5);
            expect(n.velocity).toBeGreaterThan(0);
            expect(n.velocity).toBeLessThanOrEqual(1);
          }
          for (let i = 1; i < part.notes.length; i++) expect(part.notes[i].t).toBeGreaterThanOrEqual(part.notes[i - 1].t);
          expect(part.level).toBeGreaterThan(0);
          expect(Math.abs(part.place)).toBeLessThanOrEqual(1);
        }
      });
    }
  }

  test("the bass plays the chord's root on every downbeat", () => {
    const { notes } = tuneOf("joy");
    const a = arrange(notes, { voices: 4, band: ["bass"] });
    const bass = a.band[0].notes;
    const bar = a.analysis.beat * a.analysis.meter;
    for (let t = a.analysis.downbeat; t < notes[notes.length - 1].t; t += bar) {
      const n = bass.find((x) => Math.abs(x.t - t) < 1e-6);
      expect(n).toBeDefined();
      expect(pc(n!.midi)).toBe(chordAt(a.analysis.chords, t + 1e-4).root);
    }
  });

  test("the band follows the tune's character: each song its own", () => {
    const kind = (id: string) => analyse(tuneOf(id).notes).character;
    // the six songs the arranger arranges, each heard as what it is
    expect(["twinkle", "joy", "plain-grace", "plain-adeste", "jacques", "old100"].map(kind)).toEqual(["nursery", "anthem", "ballad", "carol", "folk", "hymn"]);
    expect(suggestBand(analyse(tuneOf("twinkle").notes))).toEqual(["harp", "flute", "bass"]);
    expect(suggestBand(analyse(tuneOf("plain-grace").notes))).toEqual(["piano", "strings", "bass"]);
    expect(suggestBand(analyse(tuneOf("jacques").notes))).toEqual(["guitar", "flute", "bass"]);
    // no two of them get the same band unless they are the same kind of tune
    const bands = new Set(["twinkle", "joy", "plain-grace", "plain-adeste", "jacques", "old100"].map((id) => suggestBand(analyse(tuneOf(id).notes)).join()));
    expect(bands.size).toBe(6);
    // faster: a beat; minor and slow: lyrical; a compound beat: a jig; one chord throughout: a drone
    const fast = tuneOf("joy").notes.map((n) => ({ ...n, t: n.t / 1.3, d: n.d / 1.3 }));
    expect(suggestBand(analyse(fast))).toContain("kit");
    const minor = tuneOf("plain-grace").notes.map((n) => ({ ...n, midi: n.midi % 12 === 11 || n.midi % 12 === 4 ? n.midi - 1 : n.midi }));
    expect(["lyrical", "ballad"]).toContain(analyse(minor).character);
    const drone = Array.from({ length: 32 }, (_, i) => ({ t: i * 0.5, d: 0.5, midi: [62, 66, 69, 74, 69, 66][i % 6] }));
    expect(analyse(drone).character).toBe("raga");
    // left out, the band is the suggested one; empty, there is none
    expect(arrange(tuneOf("plain-grace").notes).band.map((p) => p.instrument)).toEqual(["piano", "strings", "bass"]);
    expect(arrange(tuneOf("plain-grace").notes, { band: [] }).band).toEqual([]);
  });
});
