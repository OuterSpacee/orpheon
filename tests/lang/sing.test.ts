/**
 * Sung Scores against the contract's slot rules: each syllable's vowel starts exactly on its
 * note, its consonants before it end there, its closing consonants end with the note, a "_"
 * holds the vowel through the next note, a diphthong glides only near the end, the singer
 * rests where the tune rests, and the pitch and vibrato curves do what a singer's do.
 */
import { describe, expect, test } from "bun:test";
import type { Phone, Score } from "../../src/contract.ts";
import { type Lang, type NoteIn, ready, sing } from "../../src/lang/index.ts";
import { isVowel } from "../../src/lang/phones.ts";
import { pitchAt, problems, valueAt } from "./check.ts";

await ready("en");

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a tune from [midi, beats] at `bpm`, starting at `start`, each note sounding `legato` of its beat */
function tune(list: [number, number][], bpm = 120, start = 0.5, legato = 1): NoteIn[] {
  const beat = 60 / bpm;
  const out: NoteIn[] = [];
  let t = start;
  for (const [midi, beats] of list) {
    if (midi > 0) out.push({ t, d: beats * beat * legato, midi });
    t += beats * beat;
  }
  return out;
}

const TWINKLE: [number, number][] = [[60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2]];
const TWINKLE_WORDS = "Twin-kle twin-kle lit-tle star, how I won-der what you are";

const vowelAt = (s: Score, t: number): Phone | undefined => s.phones.find((p) => Math.abs(p.t - t) < 1e-12 && isVowel(p.ph));
const phoneAt = (s: Score, t: number): Phone | undefined => s.phones.find((p) => p.t <= t + 1e-12 && t < p.t + p.d - 1e-12);

describe("syllables on notes", () => {
  const notes = tune(TWINKLE);
  const s = sing(notes, TWINKLE_WORDS);

  test("the score is well formed", () => expect(problems(s)).toEqual([]));

  test("every note's vowel starts exactly at the note's start", () => {
    for (const n of notes) {
      const v = s.phones.find((p) => p.t === n.t);
      expect(v).toBeDefined();
      expect(isVowel(v!.ph)).toBe(true);
    }
  });

  test("the consonants before a vowel end exactly where it starts", () => {
    // "star": s t before ɑ
    const star = notes[6];
    const i = s.phones.findIndex((p) => p.t === star.t);
    expect(s.phones.slice(i - 2, i + 1).map((p) => p.ph)).toEqual(["s", "t", "ɑ"]);
    expect(s.phones[i - 1].t + s.phones[i - 1].d).toBeCloseTo(star.t, 9);
    // a consonant before a note is heard before it, out of the note before
    expect(s.phones[i - 2].t).toBeLessThan(star.t);
    expect(s.phones[i - 2].t).toBeGreaterThan(notes[5].t);
  });

  test("the consonants after the vowel sit at the end of the note", () => {
    // "are", the last note: ɑ then ɹ, ending with the note
    const last = notes[notes.length - 1];
    const v = vowelAt(s, last.t)!;
    const i = s.phones.indexOf(v);
    expect(s.phones[i + 1].ph).toBe("ɹ");
    expect(s.phones[i + 1].t + s.phones[i + 1].d).toBeCloseTo(last.t + last.d, 9);
    // and most of the note is the vowel
    expect(v.d).toBeGreaterThan(last.d * 0.7);
  });

  test("the words are captions in order, each from its first sound to its last", () => {
    expect(s.words!.map((w) => w.text)).toEqual(["Twinkle", "twinkle", "little", "star", "how", "I", "wonder", "what", "you", "are"]);
    expect(s.words![0].t).toBeLessThan(notes[0].t);
    expect(s.words![9].t + s.words![9].d).toBeCloseTo(notes[13].t + notes[13].d, 9);
  });

  test("the pitch is the note's in the middle of each note, and glides only briefly between", () => {
    for (const n of notes) expect(pitchAt(s, n.t + n.d / 2)).toBeCloseTo(hz(n.midi), 6);
    // C to G between notes 1 and 2: on pitch 50 ms either side of the change
    expect(pitchAt(s, notes[2].t - 0.05)).toBeCloseTo(hz(60), 6);
    expect(pitchAt(s, notes[2].t + 0.05)).toBeCloseTo(hz(67), 6);
    const between = pitchAt(s, notes[2].t);
    expect(between).toBeGreaterThan(hz(60) + 1);
    expect(between).toBeLessThan(hz(67) - 1);
  });

  test("vibrato: none as a note begins, growing in on the long notes, none on short ones", () => {
    const vib = s.vibrato!;
    const long = notes[6]; // "star", two beats
    expect(valueAt(vib, long.t + 0.05)).toBe(0);
    expect(valueAt(vib, long.t + long.d - 0.05)).toBeGreaterThan(20);
    expect(valueAt(vib, long.t + 0.3)).toBeLessThan(valueAt(vib, long.t + 0.7));
    const fast = sing(tune([[60, 0.5], [62, 0.5], [64, 0.5]]), "la la la");
    for (const p of fast.vibrato!) expect(p.v).toBe(0);
  });

  test("transpose moves the whole tune; vibrato 0 turns it off", () => {
    const up = sing(notes, TWINKLE_WORDS, { transpose: 12, vibrato: 0 });
    expect(pitchAt(up, notes[3].t + 0.2)).toBeCloseTo(2 * hz(67), 6);
    expect(up.vibrato!.every((p) => p.v === 0)).toBe(true);
  });
});

describe("the lyric conventions", () => {
  test('"_" holds the syllable before over one more note, at the new pitch', () => {
    const notes = tune([[67, 1], [69, 1], [67, 1], [65, 1]]);
    const s = sing(notes, "Glo _ ri-a");
    expect(problems(s)).toEqual([]);
    // no new sound starts on the second note: the o goes on through it
    expect(s.phones.some((p) => p.t === notes[1].t)).toBe(false);
    const o = vowelAt(s, notes[0].t)!;
    expect(o.ph).toBe("o");
    expect(phoneAt(s, notes[1].t + 0.2)).toBe(phoneAt(s, notes[0].t + 0.1));
    expect(pitchAt(s, notes[1].t + 0.2)).toBeCloseTo(hz(69), 6);
    // "ri" is on the third note, "a" on the fourth
    expect(vowelAt(s, notes[2].t)?.ph).toBe("i");
    expect(vowelAt(s, notes[3].t)).toBeDefined();
  });

  test("a held syllable's closing consonant moves to the end of the last note it holds", () => {
    const notes = tune([[60, 1], [62, 1], [64, 2]], 120, 0.5, 0.7);
    const s = sing(notes, "Home _ now");
    const m = s.phones.find((p) => p.ph === "m")!;
    expect(m.t).toBeGreaterThan(notes[1].t);
    expect(m.t + m.d).toBeCloseTo(notes[1].t + notes[1].d, 9);
  });

  test('a "-" splits a word where the writer wants; a phrase the words do not reach is sung on "la"', () => {
    // two phrases with a rest between; the words fill only the first
    const notes = tune([[60, 1], [62, 1], [64, 1], [0, 1], [65, 1], [67, 1]], 120, 0.5, 0.9);
    const s = sing(notes, "Hal-le-lu");
    expect(problems(s)).toEqual([]);
    expect(vowelAt(s, notes[2].t)).toBeDefined();
    for (const n of notes.slice(3)) {
      const i = s.phones.findIndex((p) => p.t === n.t);
      expect(s.phones[i].ph).toBe("a");
      expect(s.phones[i - 1].ph).toBe("l");
    }
  });

  test("a phrase one syllable short holds a syllable over the extra note instead of singing la", () => {
    const notes = tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1]]);
    const s = sing(notes, "Hal-le-lu-jah");
    expect(problems(s)).toEqual([]);
    expect(s.phones.some((p) => p.ph === "l" && p.t > notes[3].t)).toBe(false);
    // one note starts nothing: it carries on the vowel before
    expect(notes.filter((n) => !s.phones.some((p) => p.t === n.t))).toHaveLength(1);
  });

  test("a word of several syllables without dashes takes a note for each", () => {
    const notes = tune([[60, 1], [62, 1], [64, 1]]);
    const s = sing(notes, "beautiful");
    expect(notes.map((n) => vowelAt(s, n.t)?.ph)).toEqual(["u", "ə", "ə"]);
  });

  test('"~" keeps a word on one note: its later syllables close the note', () => {
    const notes = tune([[60, 2], [62, 2]]);
    const s = sing(notes, "fire~ burns");
    expect(vowelAt(s, notes[0].t)?.ph).toBe("a");
    expect(vowelAt(s, notes[1].t)?.ph).toBe("ɚ");
    // fire's own ɚ is sung before the second note, at the end of the first
    const tail = s.phones.filter((p) => p.t > notes[0].t && p.t < notes[1].t).map((p) => p.ph);
    expect(tail).toContain("ɪ");
    expect(tail.filter((p) => p === "ɚ")).toHaveLength(1);
  });

  test("fewer pieces than syllables share notes; more pieces hold the vowel", () => {
    const three = tune([[60, 1], [62, 1], [64, 1]]);
    // "glory" is two syllables in the dictionary, written as three: the o is held
    const s = sing(three, "Glo-o-ry");
    expect(problems(s)).toEqual([]);
    expect(vowelAt(s, three[0].t)?.ph).toBe("ɔ");
    expect(vowelAt(s, three[1].t)).toBeUndefined();
    expect(vowelAt(s, three[2].t)?.ph).toBe("i");
    // two syllables written as one piece with "~": one note
    const two = sing(tune([[60, 2], [64, 1]]), "glo~ry yes");
    expect(vowelAt(two, 0.5)?.ph).toBe("ɔ");
    expect(vowelAt(two, 1.5)?.ph).toBe("ɛ");
    // in Spanish or Italian each written piece is read alone: mi-o is two syllables
    const mio = sing(tune([[60, 1], [62, 1]]), "mi-o", { lang: "it" });
    expect([vowelAt(mio, 0.5)?.ph, vowelAt(mio, 1)?.ph]).toEqual(["i", "o"]);
  });

  test("syllables the notes have no room for, even halved or shared, are not sung", () => {
    // a note can take two syllables at most (halved, or shared when too short to halve)
    const s = sing(tune([[60, 1], [62, 1]]), "one two three four five six");
    expect(s.words!.map((w) => w.text)).toEqual(["one", "two", "three", "four"]);
  });
});

describe("diphthongs, rests and crowded notes", () => {
  test("a long note holds the diphthong's first quality and glides late", () => {
    const notes = tune([[62, 4]], 120, 0.5);
    const s = sing(notes, "my");
    const a = vowelAt(s, notes[0].t)!;
    expect(a.ph).toBe("a");
    const i = s.phones[s.phones.indexOf(a) + 1];
    expect(i.ph).toBe("ɪ");
    expect(i.t).toBeGreaterThan(notes[0].t + notes[0].d - 0.2);
    expect(a.d).toBeGreaterThan(1.5);
  });

  test("where the tune rests long enough, the singer rests and breathes", () => {
    const notes = tune([[60, 1], [0, 2], [62, 1]], 120, 0.5, 0.9);
    const s = sing(notes, "one two");
    const rest = s.phones.find((p) => p.ph === "_" && p.t > notes[0].t);
    expect(rest).toBeDefined();
    expect(rest!.d).toBeGreaterThan(0.6);
    // and starts as the first note's sound ends
    expect(rest!.t).toBeCloseTo(notes[0].t + notes[0].d, 9);
  });

  test("notes sung through (legato) leave no rest between them", () => {
    const notes = tune([[60, 1], [62, 1], [64, 1]], 120, 0.5, 1);
    const s = sing(notes, "la la la");
    const inner = s.phones.filter((p) => p.t > notes[0].t && p.t < notes[2].t + notes[2].d);
    expect(inner.some((p) => p.ph === "_")).toBe(false);
  });

  test("very fast notes squeeze the consonants but never move a vowel off its note", () => {
    const notes = tune(Array.from({ length: 16 }, (_, i): [number, number] => [60 + (i % 5), 0.25]), 160);
    const s = sing(notes, "strengths splint scrimps twelfths strengths splint scrimps twelfths strengths splint scrimps twelfths strengths splint scrimps twelfths");
    expect(problems(s)).toEqual([]);
    for (const n of notes) expect(vowelAt(s, n.t)).toBeDefined();
  });

  test("a first note at the very start has no room for its consonants: its vowel still starts on it", () => {
    const notes = tune([[60, 1], [62, 1]], 120, 0);
    const s = sing(notes, "stop now");
    expect(problems(s)).toEqual([]);
    expect(s.phones[0].t).toBe(0);
    expect(isVowel(s.phones[0].ph)).toBe(true);
  });

  test("overlapping and unsorted notes are sung one at a time", () => {
    const notes: NoteIn[] = [
      { t: 1.0, d: 0.8, midi: 64 },
      { t: 0.5, d: 0.8, midi: 62 },
      { t: 1.5, d: 0.5, midi: 65 },
    ];
    const s = sing(notes, "a b c");
    expect(problems(s)).toEqual([]);
    for (const t of [0.5, 1.0, 1.5]) expect(vowelAt(s, t)).toBeDefined();
  });
});

describe("every language sings", () => {
  const notes = tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 2], [65, 1], [64, 1], [62, 2]]);
  const songs: [Lang, string][] = [
    ["en", "Oh say can you see by the"],
    ["es", "Can-ta, no llo-res"],
    ["it", "O so-le mi-o"],
    ["la", "Ky-ri-e e-le-i-son"],
    ["ja", "さ く ら さ く ら や よ"],
    ["ja", "sa-ku-ra sa-ku-ra ya-yo"],
    ["ipa", "ˈhæ.pi ˈbɚθ.deɪ tu ju"],
  ];
  for (const [lang, lyrics] of songs) {
    test(`${lang}: ${lyrics}`, () => {
      const s = sing(notes, lyrics, { lang });
      expect(problems(s)).toEqual([]);
      for (const n of notes) expect(vowelAt(s, n.t) ?? s.phones.find((p) => p.t < n.t && p.t + p.d > n.t && isVowel(p.ph))).toBeDefined();
    });
  }
});

describe("invariants on random tunes", () => {
  // a small seeded generator, so a failure can be reproduced
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const LYRICS = ["Twin-kle twin-kle lit-tle star", "a _ b-c _ _ de", "strengths and twelfths", "I", "Ky-ri-e", "", "fire~ wa-ter _ earth"];
  for (let k = 0; k < 40; k++) {
    test(`tune ${k}`, () => {
      const notes: NoteIn[] = [];
      let t = rand() * 0.6;
      const n = 1 + Math.floor(rand() * 20);
      for (let i = 0; i < n; i++) {
        const d = 0.04 + rand() * 1.2;
        notes.push({ t, d, midi: 45 + rand() * 30 });
        t += d * (rand() < 0.3 ? 0.7 : 1) + (rand() < 0.3 ? rand() * 0.8 : 0);
      }
      const lyrics = LYRICS[k % LYRICS.length];
      const s = sing(notes, lyrics, { vibrato: 35, transpose: Math.floor(rand() * 7) - 3 });
      expect(problems(s)).toEqual([]);
      // every note starts either a new vowel or nothing at all (a held one)
      const starts = new Set(s.phones.map((p) => p.t));
      const held = s.phones.filter((p) => isVowel(p.ph));
      for (const note of notes) if (!starts.has(note.t)) expect(held.some((p) => p.t < note.t && p.t + p.d > note.t)).toBe(true);
    });
  }
});
