// The built-in songs and the scores written by hand: their shape, checked note by note.
import { describe, expect, test } from "bun:test";
import { acappella } from "../../src/lang/index.ts";
import { PHONES, POSE_COUNT } from "../../src/contract.ts";
import type { Score } from "../../src/contract.ts";
import { midiToHz } from "../../src/app/notes.ts";
import { CONSONANTS, PAD_VOWELS, VOWEL_GUESS, consonantVowel, helloScore, kindOf, laScore, mouthFor, nearestVowel, spotsFrom, vowelProbe } from "../../src/app/scores.ts";
import { looksLikeMidi, otherParts, readSongFile } from "../../src/app/sing/import.ts";
import { LEAD_IN, SONGS, atTempo, choirLines, choirParts, chosenTune, plannedNotes, readTune, roleName, songTune, syllables, tidy, timed } from "../../src/app/songs.ts";
import { INITIAL, LANGS } from "../../src/app/state.ts";

/** What the contract asks of any Score. */
function expectWellFormed(score: Score): void {
  expect(score.length).toBeGreaterThan(0);
  expect(score.phones.length).toBeGreaterThan(0);
  score.phones.forEach((p, i) => {
    expect(PHONES).toContain(p.ph);
    expect(p.t).toBeGreaterThanOrEqual(0);
    expect(p.d).toBeGreaterThan(0);
    expect(p.t + p.d).toBeLessThanOrEqual(score.length + 1e-9);
    // In time order, not overlapping.
    if (i > 0) expect(p.t).toBeGreaterThanOrEqual(score.phones[i - 1].t + score.phones[i - 1].d - 1e-9);
  });
  expect(score.pitch.length).toBeGreaterThan(0);
  score.pitch.forEach((p, i) => {
    expect(p.v).toBeGreaterThan(40);
    expect(p.v).toBeLessThan(2000);
    if (i > 0) expect(p.t).toBeGreaterThanOrEqual(score.pitch[i - 1].t);
  });
  for (const w of score.words ?? []) {
    expect(w.text.length).toBeGreaterThan(0);
    expect(w.d).toBeGreaterThan(0);
  }
}

describe("reading a tune", () => {
  test("note names, lengths, sharps, rests and ties", () => {
    const { notes, bars, beats } = readTune("C4 F#4:.5 Bb3:1.5 | r:2 A4:2~ | A4:2 r:2");
    expect(notes).toEqual([
      { beat: 0, beats: 1, midi: 60 },
      { beat: 1, beats: 0.5, midi: 66 },
      { beat: 1.5, beats: 1.5, midi: 58 },
      { beat: 5, beats: 4, midi: 69 },
    ]);
    expect(bars).toEqual([3, 4, 4]);
    expect(beats).toBe(11);
  });

  test("refuses what is not a note", () => {
    expect(() => readTune("C4 H4")).toThrow();
    expect(() => readTune("C4:x")).toThrow();
  });

  test("counts one note for each syllable and each held note", () => {
    expect(syllables("A-ma-zing _ grace\n how  sweet")).toEqual(["A", "ma", "zing", "_", "grace", "how", "sweet"]);
  });
});

describe("the built-in songs", () => {
  test("their words are shown one phrase to a line", () => {
    expect(tidy("  Twin-kle   twin-kle \n\n   lit-tle star  ")).toBe("Twin-kle twin-kle\nlit-tle star");
    for (const song of SONGS) expect(syllables(tidy(song.lyrics))).toEqual(syllables(song.lyrics));
  });

  test("there are a few, each with its own id, a credit and a language the page offers", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const song of SONGS) {
      expect(song.title.length).toBeGreaterThan(3);
      expect(song.credit).toMatch(/\d{4}/);
      expect(song.lang in LANGS).toBe(true);
    }
    expect(SONGS.some((s) => s.id === INITIAL.song)).toBe(true);
  });

  for (const song of SONGS) {
    describe(song.title, () => {
      const { notes, bars } = readTune(song.tune);

      test("every bar is full: an upbeat and the last bar make one bar between them", () => {
        const inner = bars.slice(1, -1);
        for (const bar of inner) expect(bar).toBe(song.meter);
        const ends = bars[0] + bars[bars.length - 1];
        // a song written out whole may hold its last chord past the bar (tests/app/songs-written.test.ts checks its length)
        if (song.captions) expect(bars[bars.length - 1]).toBeLessThanOrEqual(song.meter);
        else expect(ends === song.meter || ends === 2 * song.meter).toBe(true);
      });

      test("one syllable for every note", () => {
        expect(syllables(song.lyrics)).toHaveLength(notes.length);
        // A held note never opens the song, and no syllable is empty.
        expect(syllables(song.lyrics)[0]).not.toBe("_");
      });

      test("every word of more than one syllable is split by hand", () => {
        // A crude count of vowel groups: a word left whole must have just one.
        // (A final "e" as in "saved" or "grace" is silent in English.)
        for (const part of syllables(song.lyrics).filter((s) => s !== "_")) {
          const whole = part.toLowerCase();
          const sounded = song.lang === "en" && /[aeiouy][^aeiouy]+e[ds]?$/.test(whole) ? whole.replace(/e[ds]?$/, "") : whole;
          // words in IPA: one vowel group, a diphthong being one
          const groups = sounded.match(song.lang === "ipa" ? /[aeiouyɪʊəɐɛɔœøæɑɒʌɜɨɯɚ]+/g : /[aeiouy]+/g) ?? [];
          expect({ part, groups: groups.length }).toEqual({ part, groups: 1 });
        }
      });

      test("the tune stays in a range a voice can sing, without wild leaps", () => {
        const pitches = notes.map((n) => n.midi);
        // a song written out whole is sung by its choir, each voice checked in its own range
        // (tests/app/hymns.test.ts, songs-a.test.ts, songs-b.test.ts); its tune may span an octave
        // and a fifth, as the Londonderry air does ("Funiculì, funiculà" and Verdi's canzone span less)
        expect(Math.max(...pitches) - Math.min(...pitches)).toBeLessThanOrEqual(song.captions ? 19 : 14);
        for (let i = 1; i < notes.length; i++) expect(Math.abs(notes[i].midi - notes[i - 1].midi)).toBeLessThanOrEqual(12);
      });

      test("its notes come out in seconds, in order, after the lead-in", () => {
        const tune = songTune(song);
        const sung = timed(tune.notes, 1);
        expect(sung[0].t).toBeCloseTo(LEAD_IN, 9);
        sung.forEach((n, i) => {
          // a grace note is the one note shorter than a tenth of a second
          expect(n.d).toBeGreaterThan(n.d < 0.1 && song.captions ? 0.05 : 0.1);
          if (i > 0) expect(n.t).toBeGreaterThanOrEqual(sung[i - 1].t + sung[i - 1].d - 1e-9);
        });
        // Twice the tempo, half the time.
        const fast = timed(tune.notes, 2);
        expect(fast[5].t - LEAD_IN).toBeCloseTo((sung[5].t - LEAD_IN) / 2, 9);
        expect(fast[5].d).toBeCloseTo(sung[5].d / 2, 9);
      });

      test("sung on la by hand, it is a well-formed score with a caption for each syllable", () => {
        const sung = timed(songTune(song).notes, 1);
        const words = syllables(song.lyrics);
        const score = laScore(sung, words, 30);
        expectWellFormed(score);
        expect(score.phones).toHaveLength(2 * sung.length);
        // Each note's vowel lands exactly on the note.
        sung.forEach((n, i) => expect(score.phones[2 * i + 1]).toMatchObject({ ph: "a", t: n.t }));
        expect(score.words).toHaveLength(words.filter((w) => w !== "_").length);
        expect(score.vibrato).toEqual([{ t: 0, v: 30 }]);
        expect(score.length).toBeGreaterThan(sung[sung.length - 1].t);
      });
    });
  }

  test("the opening notes are the tunes they claim to be", () => {
    const opening = (id: string, count: number) => readTune(SONGS.find((s) => s.id === id)!.tune).notes.slice(0, count).map((n) => n.midi);
    expect(opening("twinkle", 7)).toEqual([60, 60, 67, 67, 69, 69, 67]);
    expect(opening("joy", 8)).toEqual([64, 64, 65, 67, 67, 65, 64, 62]);
    expect(opening("grace", 5)).toEqual([62, 67, 71, 67, 71]);
    expect(opening("adeste", 6)).toEqual([67, 67, 62, 67, 69, 62]);
  });
});

describe("planning what a body sings", () => {
  const tune = chosenTune({ song: "twinkle", imported: null })!;

  test("the tune moves by octaves to suit the body, then by the transpose control", () => {
    const tenor = plannedNotes(tune, { body: 3, transpose: 0, tempo: 1 });
    const child = plannedNotes(tune, { body: 0, transpose: 0, tempo: 1 });
    const up = plannedNotes(tune, { body: 3, transpose: 2, tempo: 1 });
    expect(tenor[0].midi).toBe(48);
    expect(child[0].midi).toBe(72);
    expect(up[0].midi).toBe(50);
    expect(tenor[0].t).toBeCloseTo(LEAD_IN, 9);
  });

  test("an import that never happened is no tune", () => {
    expect(chosenTune({ song: "imported", imported: null })).toBeNull();
    expect(chosenTune({ song: "no-such-song", imported: null })).toBeNull();
  });
});

describe("scores written by hand", () => {
  test("every consonant of the Touch row makes a well-formed consonant-vowel score", () => {
    expect(new Set(CONSONANTS).size).toBe(CONSONANTS.length);
    for (const c of CONSONANTS) {
      expect(kindOf(c)).not.toBe("vowel");
      const score = consonantVowel(c, "a", 180);
      expectWellFormed(score);
      expect(score.phones.map((p) => p.ph)).toEqual([c, "a"]);
      // The vowel's voice arrives exactly where the consonant's slot ends.
      expect(score.phones[1].t).toBeCloseTo(score.phones[0].t + score.phones[0].d, 9);
      expect(score.pitch[0].v).toBe(180);
      expect(score.length).toBeLessThan(0.7);
    }
  });

  test("a stop's slot is shorter than a fricative's, an affricate's the longest", () => {
    const slot = (c: (typeof CONSONANTS)[number]) => consonantVowel(c, "a", 100).phones[0].d;
    expect(slot("t")).toBeLessThan(slot("s"));
    expect(slot("s")).toBeLessThan(slot("tʃ"));
  });

  test("every phone of the contract has a kind", () => {
    const kinds = new Set(PHONES.map(kindOf));
    expect([...kinds].sort()).toEqual(["affricate", "fricative", "glide", "nasal", "rest", "stop", "vowel"]);
    expect(kindOf("ŋ")).toBe("nasal");
    expect(kindOf("ɚ")).toBe("vowel");
  });

  test("hello is well formed and has its word", () => {
    const score = helloScore(120);
    expectWellFormed(score);
    expect(score.words).toEqual([{ text: "hello", t: 0.08, d: expect.any(Number) }]);
    expect(score.phones.map((p) => p.ph).join("")).toBe("həloʊ");
  });

  test("la follows the notes' pitches, and a gap between notes is left silent", () => {
    const score = laScore(
      [
        { t: 0.4, d: 0.5, midi: 60 },
        { t: 0.9, d: 0.5, midi: 64 },
        { t: 2, d: 0.5, midi: 67 },
      ],
      [],
      0,
    );
    expectWellFormed(score);
    expect(score.pitch[score.pitch.length - 1].v).toBeCloseTo(midiToHz(67), 6);
    // Joined notes: the first vowel ends where the second note's consonant begins.
    expect(score.phones[1].t + score.phones[1].d).toBeCloseTo(score.phones[2].t, 9);
    // The second vowel stops at its note's end; the third consonant waits for its own note.
    expect(score.phones[3].t + score.phones[3].d).toBeCloseTo(1.4, 9);
    expect(score.phones[4].t).toBeCloseTo(1.93, 9);
    expect(score.words!.map((w) => w.text)).toEqual(["la", "la", "la"]);
  });

  test("no notes, no score", () => {
    expect(laScore([]).length).toBe(0);
  });
});

describe("the vowel pad", () => {
  test("each vowel is nearest to itself, and every one is a phone the voice knows", () => {
    expect(VOWEL_GUESS.map((v) => v.ph)).toEqual(PAD_VOWELS);
    for (const v of VOWEL_GUESS) {
      expect(PHONES).toContain(v.ph);
      expect(nearestVowel(v.x, v.y)).toBe(v.ph);
    }
  });

  test("the mouth follows the tongue: on a vowel's spot it is that vowel's mouth, between two it is between", () => {
    const [i, , , a, , , , , u] = VOWEL_GUESS;
    expect(mouthFor(i.x, i.y)).toEqual({ jaw: i.jaw, lips: i.lips, round: i.round });
    expect(mouthFor(u.x, u.y).round).toBeGreaterThan(0.9);
    expect(mouthFor(a.x, a.y).jaw).toBeGreaterThan(mouthFor(i.x, i.y).jaw + 0.3);
    const between = mouthFor((i.x + u.x) / 2, (i.y + u.y) / 2);
    expect(between.round).toBeGreaterThan(0.2);
    expect(between.round).toBeLessThan(0.8);
    for (let x = 0; x <= 1; x += 0.1) {
      for (let y = 0; y <= 1; y += 0.1) for (const value of Object.values(mouthFor(x, y))) expect(value >= 0 && value <= 1).toBe(true);
    }
  });

  test("the spots are read from the poses the voice reports, and nonsense keeps the guess", () => {
    const poses = new Float32Array(2 * POSE_COUNT);
    poses.set([0.6, 150, 0.5, 0, 0, 0.4, 0.9, 0.6, 0, 0.5, 0.7, 0.1, 0, 0, 0], 0);
    poses.fill(Number.NaN, POSE_COUNT);
    const spots = spotsFrom(["i", "u"], poses);
    expect(spots[0].ph).toBe("i");
    expect(spots[0].x).toBeCloseTo(0.9, 6);
    expect(spots[0].y).toBeCloseTo(0.6, 6);
    expect(spots[0].jaw).toBeCloseTo(0.4, 6);
    expect(spots[0].lips).toBeCloseTo(0.7, 6);
    expect(spots[0].round).toBeCloseTo(0.1, 6);
    expect(spots[1]).toEqual(VOWEL_GUESS.find((v) => v.ph === "u")!);
  });

  test("a probe is one vowel alone, well formed", () => {
    for (const ph of PAD_VOWELS) {
      const score = vowelProbe(ph);
      expectWellFormed(score);
      expect(score.phones).toHaveLength(1);
    }
  });
});

describe("importing a song", () => {
  const file = (name: string, bytes: number[]) => ({ name, arrayBuffer: async () => new Uint8Array(bytes).buffer });
  const word = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const text = (s: string) => [...new TextEncoder().encode(s)];
  /** A track chunk from its events (each already with its delta time). */
  const track = (events: number[][]) => {
    const body = [...events.flat(), 0, 0xff, 0x2f, 0];
    return [...text("MTrk"), ...word(body.length), ...body];
  };
  /** A lyric event, then a quarter note (480 ticks) on `channel`. */
  const sungNote = (syllable: string, midi: number) => [
    [0, 0xff, 0x05, syllable.length, ...text(syllable)],
    [0, 0x90, midi, 90],
    [0x83, 0x60, 0x80, midi, 0],
  ];
  /** A small karaoke file: a tune with words, and a bass line under it. */
  const karaoke = [
    ...text("MThd"), ...word(6), 0, 1, 0, 2, 0x01, 0xe0,
    ...track([...sungNote("Twin", 60), ...sungNote("kle ", 60), ...sungNote("lit", 67), ...sungNote("tle ", 67), ...sungNote("star", 69)]),
    ...track([[0, 0x91, 36, 80], [0x8f, 0x00, 0x81, 36, 0]]),
  ];

  test("knows a MIDI file by its first four letters", () => {
    expect(looksLikeMidi(new Uint8Array(karaoke))).toBe(true);
    expect(looksLikeMidi(new TextEncoder().encode("hello, this is not a midi file"))).toBe(false);
    expect(looksLikeMidi(new Uint8Array([0x4d, 0x54]))).toBe(false);
  });

  test("a karaoke file becomes a tune with its words, counted from its first note", async () => {
    const result = await readSongFile(file("little star.kar", karaoke));
    if (!result.ok) throw new Error(result.message);
    expect(result.tune.title).toBe("little star");
    expect(result.tune.notes.map((n) => n.midi)).toEqual([60, 60, 67, 67, 69]);
    expect(result.tune.notes[0].t).toBe(0);
    expect(result.tune.notes[1].t).toBeCloseTo(0.5, 6);
    expect(syllables(result.tune.lyrics)).toHaveLength(5);
    expect(result.tune.source).toBeDefined();
    expect(otherParts(result.tune.source!)).toBe(1);
    // And it plans like any other tune: a tenor sings it an octave down, after the lead-in.
    const planned = plannedNotes(result.tune, { body: 3, transpose: 0, tempo: 1 });
    expect(planned[0]).toMatchObject({ t: LEAD_IN, midi: 48 });
  });

  test("the first note keeps its room, alone or in a choir, at any tempo", async () => {
    const result = await readSongFile(file("little star.kar", karaoke));
    if (!result.ok) throw new Error(result.message);
    const source = result.tune.source!;
    // As read: the reader leaves half a second before the earliest note.
    expect(source.notes[0].t).toBeCloseTo(0.5, 6);
    for (const tempo of [0.5, 1, 1.5, 2]) {
      // Alone: after the page's own lead-in.
      expect(plannedNotes(result.tune, { body: 2, transpose: 0, tempo })[0].t).toBeGreaterThanOrEqual(0.3);
      // In a choir: the file itself is hurried, and its lead is kept.
      const file = atTempo(source, tempo);
      expect(file.notes[0].t).toBeCloseTo(0.5, 6);
      expect(file.notes[1].t - file.notes[0].t).toBeCloseTo(0.5 / tempo, 6);
      expect(file.notes[0].d).toBeCloseTo(source.notes[0].d / tempo, 6);
      expect(file.song.tracks[1].notes[0].duration).toBeCloseTo(source.song.tracks[1].notes[0].duration / tempo, 6);
      for (const part of acappella(file)) {
        const first = part.score.phones.find((p) => p.ph !== "_")!;
        expect(first.t).toBeGreaterThanOrEqual(0.25);
        expect(first.d).toBeGreaterThan(0.02);
      }
    }
    expect(atTempo(source, 1)).toBe(source);
  });

  test("a file that is not MIDI fails with words that name it", async () => {
    expect(await readSongFile(file("notes.txt", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))).toEqual({
      ok: false,
      message: "“notes.txt” is not a MIDI or karaoke file.",
    });
    expect(await readSongFile(file("empty.mid", []))).toEqual({ ok: false, message: "“empty.mid” is empty." });
  });

  test("a damaged file fails with the reader's reason, and one with no notes says so", async () => {
    const cut = await readSongFile(file("cut.mid", karaoke.slice(0, 40)));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.message).toMatch(/^“cut.mid” could not be read: .+\.$/);
    const silent = [...text("MThd"), ...word(6), 0, 1, 0, 1, 0x01, 0xe0, ...track([[0, 0xff, 0x03, 2, ...text("no")]])];
    const none = await readSongFile(file("silent.mid", silent));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.message).toMatch(/silent.mid/);
  });

  test("a file that cannot be opened fails gently", async () => {
    const broken = { name: "gone.mid", arrayBuffer: () => Promise.reject(new Error("gone")) };
    expect(await readSongFile(broken)).toEqual({ ok: false, message: "“gone.mid” could not be opened." });
  });
});

describe("a choir", () => {
  const score: Score = {
    phones: [{ ph: "a", t: 1, d: 2 }],
    pitch: [{ t: 1, v: 200 }],
    vibrato: [{ t: 0, v: 30 }],
    words: [{ text: "ah", t: 1, d: 2 }],
    length: 4,
  };

  test("the tune stands in front and in the middle, the others quieter at the sides", () => {
    const parts = choirParts(
      [
        { role: "bass", body: "bass", score },
        { role: "tune", body: "alto", score },
        { role: "pad", body: "soprano", score },
        { role: "drums", body: "tenor", score },
      ],
    );
    expect(parts.map((p) => p.body)).toEqual([2, 4, 1, 3]);
    expect(parts[0]).toMatchObject({ level: 0.75, place: 0 });
    expect(parts[1].place).toBeLessThan(0);
    expect(parts[2].place).toBeGreaterThan(0);
    for (const p of parts.slice(1)) expect(p.level).toBeLessThan(parts[0].level);
    // Never more voices than there are seats.
    expect(choirParts(new Array(9).fill({ role: "pad", body: "alto", score }))).toHaveLength(6);
  });
});

describe("songs written for a choir", () => {
  const round = SONGS.find((s) => s.id === "jacques")!;
  const hymn = SONGS.find((s) => s.id === "old100")!;
  const plain = { transpose: 0, tempo: 1 };
  /** Where each body sings comfortably, as MIDI notes (the usual choir ranges). */
  const RANGES: Record<string, [number, number]> = { soprano: [60, 81], alto: [53, 74], tenor: [48, 69], bass: [40, 64] };

  test("each is in the list for four different bodies, with the names the stage writes under them", () => {
    for (const song of [round, hymn]) {
      expect(song.voices!.map((v) => v.name)).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
      const lines = choirLines(song, plain);
      expect(lines.map((l) => l.body)).toEqual([1, 2, 3, 4]);
      for (const line of lines) {
        expect(line.level).toBeGreaterThan(0.2);
        expect(Math.abs(line.place)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  test("the round: every voice sings the same tune, each coming in two bars after the one before", () => {
    const lines = choirLines(round, plain);
    const beat = 60 / round.bpm;
    const first = lines[0].notes;
    lines.forEach((line, i) => {
      expect(line.notes).toHaveLength(first.length);
      expect(line.notes[0].t - first[0].t).toBeCloseTo(i * 8 * beat, 9);
      // The low voices an octave down, the same tune.
      const shift = i >= 2 ? -12 : 0;
      line.notes.forEach((n, k) => expect(n.midi).toBe(first[k].midi + shift));
    });
    // All four sing together for a while: the last comes in before the first is done.
    const end = first[first.length - 1].t + first[first.length - 1].d;
    expect(lines[3].notes[0].t).toBeLessThan(end - 8 * beat);
  });

  test("the hymn: four voices on the same rhythm, a syllable to every chord, each in its range", () => {
    const lines = choirLines(hymn, plain);
    const words = syllables(hymn.lyrics);
    for (const line of lines) {
      expect(line.notes).toHaveLength(words.length);
      line.notes.forEach((n, k) => {
        expect(n.t).toBeCloseTo(lines[0].notes[k].t, 9);
        expect(n.d).toBeCloseTo(lines[0].notes[k].d, 9);
      });
    }
    lines.forEach((line, i) => {
      const [low, high] = RANGES[hymn.voices![i].body];
      for (const n of line.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(low);
        expect(n.midi).toBeLessThanOrEqual(high);
      }
      // Each voice below the one above it, chord by chord.
      if (i > 0) line.notes.forEach((n, k) => expect(n.midi).toBeLessThanOrEqual(lines[i - 1].notes[k].midi));
    });
    // Ken's words on the Genevan tune: "Praise God, from whom all blessings flow" opens on the keynote.
    expect(lines[0].notes.slice(0, 8).map((n) => n.midi)).toEqual([67, 67, 66, 64, 62, 67, 69, 71]);
  });

  test("the transpose and tempo controls move every voice together", () => {
    const moved = choirLines(round, { transpose: 2, tempo: 2 });
    const plainLines = choirLines(round, plain);
    moved.forEach((line, i) => {
      expect(line.notes[3].midi).toBe(plainLines[i].notes[3].midi + 2);
      expect(line.notes[3].t - LEAD_IN).toBeCloseTo((plainLines[i].notes[3].t - LEAD_IN) / 2, 9);
    });
  });

  test("an arrangement's singers are named by what they sing", () => {
    expect(roleName("tune", "soprano")).toBe("Tune · soprano");
    expect(roleName("bass", "bass")).toBe("Bass");
    expect(roleName("bass", "tenor")).toBe("Bass line · tenor");
    expect(roleName("drums", "tenor")).toBe("Mouth drums");
  });
});
