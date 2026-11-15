/**
 * Words written apart from the tune, fitted onto it (fit.ts): lines find their phrases, a
 * miscounted line is mended inside itself and the lines after it stay on their own phrases,
 * the writer's marks win, and sing() sings what the fit says, each vowel on its note.
 */
import { describe, expect, test } from "bun:test";
import type { Score } from "../../src/contract.ts";
import { SONGS, songTune } from "../../src/app/songs.ts";
import { phraseStarts } from "../../src/lang/fit.ts";
import { describeFit, fitLyrics, importSong, type LyricFit, type NoteIn, ready, sing } from "../../src/lang/index.ts";
import { isVowel } from "../../src/lang/phones.ts";
import { problems } from "./check.ts";
import { FRERE_JACQUES, inTicks, line, smf, tempo, track, trackName } from "./smf.ts";

await ready("en");

/** a tune from [midi, beats] at `bpm`; a midi of 0 is a rest; each note sounds `legato` of its beat */
function tune(list: [number, number][], bpm = 120, legato = 1, start = 0.5): NoteIn[] {
  const beat = 60 / bpm;
  const out: NoteIn[] = [];
  let t = start;
  for (const [midi, beats] of list) {
    if (midi > 0) out.push({ t, d: beats * beat * legato, midi });
    t += beats * beat;
  }
  return out;
}

const twinkle = songTune(SONGS.find((s) => s.id === "twinkle")!);
const TWINKLE_LINES = [
  "Twin-kle twin-kle lit-tle star",
  "how I won-der what you are",
  "Up a-bove the world so high",
  "like a dia-mond in the sky",
  "Twin-kle twin-kle lit-tle star",
  "how I won-der what you are",
];
const firsts = (fit: LyricFit) => fit.lines.map((l) => l.first);
const hows = (fit: LyricFit) => fit.lines.map((l) => l.how.join("+"));
const vowelStarts = (s: Score) => new Set(s.phones.filter((p) => isVowel(p.ph)).map((p) => p.t));

describe("phrases", () => {
  test("a tune with no rests at all: its long notes and its repeats end phrases", () => {
    const b = phraseStarts(twinkle.notes);
    const starts = b.slice(0, -1).flatMap((x, i) => (x >= 0.45 ? [i] : []));
    expect(starts).toEqual([0, 7, 14, 21, 28, 35]);
    // Frère Jacques: no rest, no long note in its first two bars, but each bar comes twice
    const fj = phraseStarts(tune(FRERE_JACQUES));
    expect([4, 8, 11].every((i) => fj[i] >= 0.45)).toBe(true);
    expect([1, 2, 3, 5, 6, 7, 9, 10, 12, 13].every((i) => fj[i] < 0.45)).toBe(true);
  });

  test("a rest ends a phrase; detached notes do not", () => {
    const rests = phraseStarts(tune([[60, 1], [62, 1], [64, 1], [0, 1], [65, 1], [67, 1], [65, 1]], 120, 0.9));
    expect(rests[3]).toBe(1);
    expect(rests[1]).toBe(0);
    // every note half its beat: the gaps are the touch, not rests
    const staccato = phraseStarts(tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [65, 1]], 120, 0.5));
    expect(staccato.slice(1, -1).every((x) => x < 0.45)).toBe(true);
  });
});

describe("lines onto phrases", () => {
  test("every built-in song fits exactly, one syllable to a note, each line where it was written", () => {
    for (const song of SONGS) {
      const t = songTune(song);
      const fit = fitLyrics(t.notes, song.lyrics, song.lang);
      expect(hows(fit).every((h) => h === "exact")).toBe(true);
      expect(fit.la + fit.leftOver).toBe(0);
      // each line starts where the lines before it, counted, end
      let at = 0;
      for (const l of fit.lines) {
        expect(l.first).toBe(at);
        at += l.syllables;
      }
      expect(describeFit(fit)).toBe("Every line fits its phrase.");
    }
  });

  test("one syllable too many in line 3 and one too few in line 5: the lines after each stay on their phrases", () => {
    const words = [...TWINKLE_LINES];
    words[2] = "Up a-bove the big world so high";
    words[4] = "Twin-kle twin-kle lit star";
    const fit = fitLyrics(twinkle.notes, words.join("\n"));
    expect(firsts(fit)).toEqual([0, 7, 14, 21, 28, 35]);
    expect(hows(fit)).toEqual(["exact", "exact", "split", "exact", "held", "exact"]);
    // the extra syllable takes half of the line's longest note
    const split = fit.notes.findIndex((n) => n.kind === "split");
    expect(split).toBe(20);
    expect(fit.notes[20].text).toEqual(["so", "high"]);
    // the missing one is made up by a melisma on the line's last syllable, moving down a step
    expect(fit.notes[33].text).toEqual(["star"]);
    expect(fit.notes[34]).toMatchObject({ kind: "held", marked: false, text: [] });
    expect(describeFit(fit)).toBe("Line 3 has eight syllables for seven notes, so one note was split. Join syllables with ~ to keep them on one note. Also line 5.");
  });

  test("and sing() sings it so: the split note's halves each start a vowel, the held note none", () => {
    const words = [...TWINKLE_LINES];
    words[2] = "Up a-bove the big world so high";
    words[4] = "Twin-kle twin-kle lit star";
    const notes = twinkle.notes.map((n) => ({ ...n, t: n.t + 0.4 }));
    const s = sing(notes, words.join("\n"));
    expect(problems(s)).toEqual([]);
    const starts = vowelStarts(s);
    const split = notes[20];
    expect(starts.has(split.t) && starts.has(split.t + split.d / 2)).toBe(true);
    expect(starts.has(notes[34].t)).toBe(false);
    for (const i of [21, 28, 35]) expect(starts.has(notes[i].t)).toBe(true);
    expect(s.words!.map((w) => w.text)).toContain("big");
  });

  test("a line short by one in the middle of a song with rests holds a syllable; the next line starts after the rest", () => {
    // four phrases of four notes, a rest after each
    const notes = tune([[60, 1], [62, 1], [64, 1], [65, 1], [0, 1], [67, 1], [65, 1], [64, 1], [62, 1], [0, 1], [64, 1], [65, 1], [67, 1], [69, 1], [0, 1], [67, 1], [65, 1], [64, 1], [60, 2]], 120, 0.9);
    const fit = fitLyrics(notes, "one two three four\nfive six se-\nnine ten e-le-ven\nthir-teen fif-teen");
    expect(firsts(fit)).toEqual([0, 4, 8, 12]);
    expect(hows(fit)).toEqual(["exact", "held", "split", "exact"]);
    // the held note is not across a rest: it is inside line 2's phrase
    const held = fit.notes.findIndex((n) => n.kind === "held");
    expect(held).toBeGreaterThan(4);
    expect(held).toBeLessThan(8);
  });

  test("a real MIDI tune: Frère Jacques read from a file, one syllable too many in its first line", () => {
    const bytes = smf(1, 480, [track([tempo(0, 100)]), track([trackName("Tune"), ...line(0, inTicks(FRERE_JACQUES, 480))])]);
    const song = importSong(bytes);
    const fit = fitLyrics(song.notes, "Are you sleep-ing now\nare you sleep-ing\nBro-ther John\nBro-ther John");
    expect(firsts(fit)).toEqual([0, 4, 8, 11]);
    expect(hows(fit)).toEqual(["split", "exact", "exact", "exact"]);
  });

  test("more lines than phrases: two lines share a phrase, and a miscount stays in its line", () => {
    const notes = tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [65, 1], [64, 1], [62, 1], [0, 1], [64, 1], [65, 1], [67, 1], [69, 1], [67, 1], [65, 1], [64, 1], [62, 1]], 120, 0.95);
    const exact = fitLyrics(notes, "one two three four\nfive six se-ven\nnine ten e-le\nthir-teen four-teen");
    expect(firsts(exact)).toEqual([0, 4, 8, 12]);
    expect(hows(exact).every((h) => h === "exact")).toBe(true);
    const over = fitLyrics(notes, "one two three four\nfive six se-ven\nnine ten e-le-ven\nthir-teen four-teen");
    expect(firsts(over)).toEqual([0, 4, 8, 12]);
    expect(hows(over)).toEqual(["exact", "exact", "split", "exact"]);
  });

  test("a line may run over two short phrases", () => {
    const notes = tune([[60, 1], [62, 1], [0, 1], [64, 1], [65, 1], [0, 1], [67, 1], [65, 1], [0, 1], [64, 1], [62, 1]], 120, 0.9);
    const fit = fitLyrics(notes, "one two three four\nfive six se-ven");
    expect(firsts(fit)).toEqual([0, 4]);
    expect(hows(fit)).toEqual(["exact", "exact"]);
  });

  test("a single long line over the whole song", () => {
    const fit = fitLyrics(twinkle.notes, TWINKLE_LINES.join(" "));
    expect(fit.lines).toHaveLength(1);
    expect(fit.lines[0]).toMatchObject({ first: 0, last: 41, notes: 42, syllables: 42, how: ["exact"] });
    expect(describeFit(fit)).toBe("Every syllable has its note.");
  });
});

describe("without line breaks the phrases still guide", () => {
  test("an extra syllable is mended in its own phrase: the phrase after starts on a word, not inside one", () => {
    // phrase 1 ends on a two-syllable word; one syllable too many in it
    const words = ["Twin-kle twin-kle ti-ny star-light", ...TWINKLE_LINES.slice(1)].join(" ");
    const fit = fitLyrics(twinkle.notes, words);
    const split = fit.notes.findIndex((n) => n.kind === "split");
    expect(split).toBeGreaterThanOrEqual(0);
    expect(split).toBeLessThan(7);
    expect(fit.notes[6].text.at(-1)).toBe("light");
    expect(fit.notes[7].text).toEqual(["how"]);
    expect(describeFit(fit)).toBe("The words have 43 syllables for 42 notes, so one note was split. Join syllables with ~ to keep them on one note.");
  });

  test("the words run out: the phrases they never reach are sung on la", () => {
    const fit = fitLyrics(twinkle.notes, TWINKLE_LINES.slice(0, 2).join(" "));
    expect(fit.la).toBe(28);
    expect(fit.notes[14]).toMatchObject({ kind: "la", text: ["la"], line: -1 });
    expect(fit.notes[13].text).toEqual(["are"]);
    expect(describeFit(fit)).toBe("The words run out before the tune: the last 28 notes are sung on “la”.");
  });
});

describe("the writer's marks win", () => {
  const notes = tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [71, 1], [72, 2]]);

  test('"_" stays a hold where it was written, and the fit adds its own only for what is missing', () => {
    const fit = fitLyrics(notes, "Glo _ _ ri-a");
    expect(fit.notes.slice(0, 4).map((n) => [n.kind, n.marked, n.text.join()])).toEqual([["sung", false, "Glo"], ["held", true, ""], ["held", true, ""], ["sung", false, "ri"]]);
    // the three notes to spare hold "ri" or "a", never "Glo" beyond what the writer gave it
    expect(fit.notes.filter((n) => n.kind === "held" && !n.marked)).toHaveLength(3);
    expect(fit.lines[0].held).toBe(3);
  });

  test('"~" keeps its syllables on one note even with notes to spare', () => {
    const fit = fitLyrics(notes, "fire~ wa-ter earth stone sky");
    expect(fit.notes[0]).toMatchObject({ kind: "sung", text: ["fire"] });
    expect(fit.notes[1].text).toEqual(["wa"]);
  });

  test('"-" pieces are never put back onto one note: on notes too short to halve, other syllables share', () => {
    // four notes of 0.2 s: halves would be too short to sing
    const fast = tune([[60, 0.4], [62, 0.4], [64, 0.4], [65, 0.4]]);
    const fit = fitLyrics(fast, "Hal-le-lu-jah sing");
    expect(fit.notes.map((n) => [n.kind, n.text.join("|")])).toEqual([["sung", "Hal"], ["sung", "le"], ["sung", "lu"], ["merged", "jah~sing"]]);
    const pieces = fitLyrics(fast.slice(0, 2), "Hal-le-lu");
    expect(pieces.notes.some((n) => n.kind === "merged")).toBe(false);
    expect(pieces.leftOver).toBe(1);
    expect(describeFit(pieces)).toBe("The words have three syllables for two notes, so one is not sung. Take out a word, or join syllables with ~ to share a note.");
  });

  test("a merged note sings both syllables and captions both words", () => {
    const fast = tune([[60, 0.4], [62, 0.4], [64, 0.4]]);
    const s = sing(fast, "one two three four");
    expect(problems(s)).toEqual([]);
    expect(s.words!.map((w) => w.text)).toEqual(["one", "two", "three", "four"]);
    for (const n of fast) expect(vowelStarts(s).has(n.t)).toBe(true);
  });
});

describe("the report", () => {
  test("syllables the dictionary found in a word show as pieces of its spelling", () => {
    const fit = fitLyrics(tune([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1]]), "wonderful above");
    expect(fit.notes.map((n) => n.text[0])).toEqual(["won", "der", "ful", "a", "bove"]);
  });

  test("line numbers count the lines as typed, blank ones too", () => {
    const words = [...TWINKLE_LINES];
    words[2] = "Up a-bove the big world so high";
    const fit = fitLyrics(twinkle.notes, [words[0], words[1], "", words[2], words[3], words[4], words[5]].join("\n"));
    expect(fit.lines.map((l) => l.number)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(describeFit(fit)).toStartWith("Line 4 has eight syllables");
  });

  test("no words: nothing to say, and every note is la", () => {
    const fit = fitLyrics(twinkle.notes, "");
    expect(describeFit(fit)).toBe("");
    expect(fit.la).toBe(42);
  });
});

describe("random tunes in phrases, with a line miscounted", () => {
  let seed = 2024;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const WORDS = ["sun", "moon", "star", "light", "rain", "sky", "sea", "wind", "song", "day", "night", "home"];
  const pick = () => WORDS[Math.floor(rand() * WORDS.length)];
  for (let k = 0; k < 30; k++) {
    test(`tune ${k}`, () => {
      // phrases of 4 to 9 notes with a beat of rest after each
      const list: [number, number][] = [];
      const lengths: number[] = [];
      const phrases = 3 + Math.floor(rand() * 5);
      for (let p = 0; p < phrases; p++) {
        const n = 4 + Math.floor(rand() * 6);
        lengths.push(n);
        for (let i = 0; i < n; i++) list.push([55 + Math.floor(rand() * 15), [0.5, 1, 1, 1.5, 2][Math.floor(rand() * 5)]]);
        list.push([0, 1]);
      }
      const notes = tune(list, 100, 0.9);
      const starts = lengths.map((_, p) => lengths.slice(0, p).reduce((a, b) => a + b, 0));
      const lines = lengths.map((n) => Array.from({ length: n }, pick));
      const exact = fitLyrics(notes, lines.map((l) => l.join(" ")).join("\n"));
      expect(firsts(exact)).toEqual(starts);
      expect(hows(exact).every((h) => h === "exact")).toBe(true);
      // one word more or one fewer in a line in the middle: every line still starts on its phrase
      const middle = 1 + Math.floor(rand() * (phrases - 2));
      const more = rand() < 0.5;
      lines[middle] = more ? [...lines[middle], pick()] : lines[middle].slice(1);
      const words = lines.map((l) => l.join(" ")).join("\n");
      const fit = fitLyrics(notes, words);
      expect(firsts(fit)).toEqual(starts);
      expect(hows(fit).filter((h) => h !== "exact")).toEqual([more ? fit.lines[middle].how.join("+") : "held"]);
      if (more) expect(["split", "merged"]).toContain(fit.lines[middle].how[0]);
      const s = sing(notes, words);
      expect(problems(s)).toEqual([]);
    });
  }
});
