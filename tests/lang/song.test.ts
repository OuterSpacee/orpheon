/**
 * A file's bytes to something to sing: importSong() on karaoke and plain MIDI files built in
 * code (smf.ts), its lyrics onto the tune's notes, and acappella()'s parts.
 */
import { describe, expect, test } from "bun:test";
import { acappella, importSong, ready, sing } from "../../src/lang/index.ts";
import { isVowel } from "../../src/lang/phones.ts";
import { problems } from "./check.ts";
import { type Ev, inTicks, line, lyric, note, smf, tempo, text, track, trackName, TWINKLE } from "./smf.ts";

await ready("en");

const Q = 480;
const KARAOKE = ["\\Twin", "kle ", "twin", "kle ", "lit", "tle ", "star", "/how ", "I ", "won", "der ", "what ", "you ", "are"];

/** an event on the start of each note of a [midi, quarters] tune */
function onNotes(tune: [number, number][], words: (string | null)[], make: (tick: number, s: string) => Ev): Ev[] {
  const out: Ev[] = [];
  let tick = 0;
  let w = 0;
  for (const [midi, quarters] of tune) {
    if (midi > 0) {
      const word = words[w++];
      if (word !== null && word !== undefined) out.push(make(tick, word));
    }
    tick += quarters * Q;
  }
  return out;
}

const karaoke = () =>
  smf(1, Q, [
    track([tempo(0, 120)]),
    track([trackName("Words"), text(0, "@KMIDI KARAOKE FILE"), text(0, "@TTwinkle Twinkle"), ...onNotes(TWINKLE, KARAOKE, text)]),
    track([trackName("Melody"), ...line(0, inTicks(TWINKLE, Q))]),
  ]);

describe("importSong", () => {
  test("a karaoke file: the tune, its words in sing()'s syntax, and an offset for the first consonants", () => {
    const song = importSong(karaoke());
    expect(song.title).toBe("Twinkle Twinkle");
    expect(song.tempo).toBe(120);
    expect(song.melodyTrack).toBe(2);
    expect(song.lyrics).toBe("Twin-kle twin-kle lit-tle star how I won-der what you are");
    expect(song.offset).toBe(0.5);
    expect(song.notes).toHaveLength(14);
    expect(song.notes[0]).toEqual({ t: 0.5, d: 0.5, midi: 60 });
    expect(song.notes[7]).toEqual({ t: 4.5, d: 0.5, midi: 65 });
    expect(song.duration).toBe(8.5);
    expect(song.tracks.map((t) => [t.name, t.notes, t.melodyScore !== null])).toEqual([
      ["", 0, false],
      ["Words", 0, false],
      ["Melody", 14, true],
    ]);
    expect(song.tracks[2].low).toBe(60);
    expect(song.tracks[2].high).toBe(69);
  });

  test("and sing() sings it: a vowel on every note's start", () => {
    const song = importSong(karaoke());
    const s = sing(song.notes, song.lyrics);
    expect(problems(s)).toEqual([]);
    for (const n of song.notes) expect(isVowel(s.phones.find((p) => p.t === n.t)!.ph)).toBe(true);
    expect(s.words!.map((w) => w.text).join(" ")).toBe("Twinkle twinkle little star how I wonder what you are");
  });

  test("a note with no word, close after a sung one, holds it; inside a word the hold sits between its pieces", () => {
    const tune: [number, number][] = [[67, 1], [69, 1], [67, 1], [65, 1], [64, 2]];
    const bytes = smf(1, Q, [track([tempo(0, 120)]), track([trackName("Voice"), ...line(0, inTicks(tune, Q)), ...onNotes(tune, ["Glo", null, "ri", "a ", "sing"], lyric)])]);
    const song = importSong(bytes);
    expect(song.lyrics).toBe("Glo-_-ri-a sing");
    expect(song.notes).toHaveLength(5);
    const s = sing(song.notes, song.lyrics);
    expect(problems(s)).toEqual([]);
    expect(s.phones.some((p) => p.t === song.notes[1].t)).toBe(false);
  });

  test("two lyric events on one note are sung on it together; a word given one note keeps it", () => {
    const tune: [number, number][] = [[60, 2], [62, 2]];
    const bytes = smf(1, Q, [track([tempo(0, 120)]), track([...line(0, inTicks(tune, Q)), lyric(0, "fi"), lyric(0, "re "), lyric(2 * Q, "flower")])]);
    const song = importSong(bytes);
    expect(song.lyrics).toBe("fi~re flower~");
    const s = sing(song.notes, song.lyrics);
    expect(s.words!.map((w) => w.text)).toEqual(["fire", "flower"]);
    // two notes, two vowels on them
    expect(song.notes.map((n) => s.phones.find((p) => p.t === n.t)?.ph)).toEqual(["a", "a"]);
  });

  test("notes before the words begin are left to the instruments, and that is said", () => {
    const intro: [number, number][] = [[72, 1], [74, 1], [0, 2], ...TWINKLE];
    const words: (string | null)[] = [null, null, ...KARAOKE];
    const bytes = smf(1, Q, [track([tempo(0, 120)]), track([trackName("Lead"), ...line(0, inTicks(intro, Q)), ...onNotes(intro, words, lyric)])]);
    const song = importSong(bytes);
    expect(song.notes).toHaveLength(14);
    expect(song.notes[0].t).toBe(2.5);
    expect(song.warnings.some((w) => w.includes("2 notes"))).toBe(true);
  });

  test("a file with no words: the whole tune, and no lyrics (sing() sings la)", () => {
    const song = importSong(smf(1, Q, [track([tempo(0, 90), ...line(0, inTicks(TWINKLE, Q))])]));
    expect(song.lyrics).toBe("");
    expect(song.notes).toHaveLength(14);
    const s = sing(song.notes, song.lyrics);
    expect(s.phones.filter((p) => p.ph === "l")).toHaveLength(14);
  });

  test("the tune can be taken from a chosen track; the offset is shared by every track", () => {
    const bytes = smf(1, Q, [
      track([tempo(0, 120)]),
      track([trackName("Lead"), ...note(4 * Q, Q, 0, 72), ...note(5 * Q, Q, 0, 74)]),
      track([trackName("Bass"), ...note(0, 4 * Q, 1, 36)]),
    ]);
    const lead = importSong(bytes);
    expect(lead.melodyTrack).toBe(1);
    expect(lead.offset).toBe(0.5);
    expect(lead.notes[0].t).toBe(2.5);
    const bass = importSong(bytes, { track: 2 });
    expect(bass.melodyTrack).toBe(2);
    expect(bass.notes[0]).toEqual({ t: 0.5, d: 2, midi: 36 });
  });

  test("a file that is not MIDI is refused in plain words", () => {
    expect(() => importSong(new TextEncoder().encode("not a midi file"))).toThrow("does not look like a MIDI file");
  });
});

describe("acappella", () => {
  const tune = inTicks(TWINKLE, Q);
  const WORDS = ["Twin", "kle ", "twin", "kle ", "lit", "tle ", "star ", "how ", "I ", "won", "der ", "what ", "you ", "are"];
  const bass = line(1, [[36, 2 * Q], [43, 2 * Q], [41, 2 * Q], [36, 2 * Q], [41, 2 * Q], [36, 2 * Q], [43, 2 * Q], [36, 2 * Q]]);
  const strings = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]].flatMap((c, bar) => c.flatMap((m) => note(bar * 4 * Q, 4 * Q, 2, m)));
  // kick on 1 and 3, snare on 2 and 4, a closed hat on every eighth, an open hat at the end
  const drums = Array.from({ length: 16 }, (_, beat) => [...note(beat * Q, Q / 4, 9, beat % 2 ? 38 : 36), ...note(beat * Q + Q / 2, Q / 8, 9, beat === 15 ? 46 : 42)]).flat();
  const bytes = smf(1, Q, [
    track([trackName("Twinkle"), tempo(0, 120)]),
    track([trackName("Lead Vocals"), ...line(0, tune), ...onNotes(TWINKLE, WORDS, lyric)]),
    track([trackName("Bass"), ...bass]),
    track([trackName("Strings"), ...strings]),
    track([trackName("Drums"), ...drums]),
  ]);
  const song = importSong(bytes);
  const parts = acappella(song);

  test("one part for the tune, the bass, the chords and the drums", () => {
    expect(parts.map((p) => [p.name, p.role])).toEqual([
      ["Lead Vocals", "tune"],
      ["Strings", "pad"],
      ["Bass", "bass"],
      ["Drums", "drums"],
    ]);
    for (const p of parts) expect(problems(p.score)).toEqual([]);
  });

  test("each line sits in a body that suits its range, moved only by octaves", () => {
    const byRole = Object.fromEntries(parts.map((p) => [p.role, p]));
    expect(byRole.bass.body).toBe("bass");
    // the bass line (C2..G2) goes up an octave or two into a bass's range
    expect(byRole.bass.transpose % 12).toBe(0);
    expect(byRole.bass.transpose).toBeGreaterThan(0);
    // C4..A4 sits in the middle of an alto (F3..D5)
    expect(byRole.tune.body).toBe("alto");
    expect(byRole.tune.transpose).toBe(0);
    for (const p of parts) expect(p.transpose % 12).toBe(0);
    // the tune keeps its words
    expect(byRole.tune.score.words!.map((w) => w.text).slice(0, 4)).toEqual(["Twinkle", "twinkle", "little", "star"]);
  });

  test('the bass sings "dum"; the pad holds "oo" through each chord change', () => {
    const b = parts.find((p) => p.role === "bass")!.score;
    expect(b.phones.filter((p) => p.ph === "d")).toHaveLength(8);
    expect(b.phones.filter((p) => p.ph === "m")).toHaveLength(8);
    const pad = parts.find((p) => p.role === "pad")!.score;
    const vowels = pad.phones.filter((p) => isVowel(p.ph));
    // four chords sung through: one long "oo" (a new note is a new pitch, not a new consonant)
    expect(vowels.every((p) => p.ph === "u")).toBe(true);
    expect(pad.phones.some((p) => !isVowel(p.ph) && p.ph !== "_")).toBe(false);
  });

  test("the drums are mouth sounds with their burst on the beat", () => {
    const d = parts.find((p) => p.role === "drums")!.score;
    const start = song.offset;
    const kicks = d.phones.filter((p) => p.ph === "p" && d.phones[d.phones.indexOf(p) + 1]?.ph !== "f");
    expect(kicks).toHaveLength(8);
    kicks.forEach((k, i) => {
      const beat = start + i * 2 * 0.5;
      expect(k.t).toBeLessThan(beat);
      expect(k.t + k.d).toBeGreaterThan(beat);
    });
    // snares: p then f; hats: ts; the open hat: ts then s
    expect(d.phones.filter((p) => p.ph === "f")).toHaveLength(8);
    expect(d.phones.filter((p) => p.ph === "ts").length).toBe(16);
    expect(d.phones[d.phones.length - 1].ph).toBe("s");
  });

  test("at most the parts asked for, and the tune first", () => {
    const two = acappella(song, { parts: 2 });
    expect(two.map((p) => p.role)).toEqual(["tune", "drums"]);
    expect(acappella(song, { parts: 1 }).map((p) => p.role)).toEqual(["tune"]);
  });
});
