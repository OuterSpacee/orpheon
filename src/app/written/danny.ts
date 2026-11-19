// "Danny boy": Frederic Weatherly's words (1913) on the traditional Irish "Londonderry air" (first
// printed in George Petrie's collection, 1855), for four voices with harp, strings, flute, a
// double bass and timpani, in E flat. Written for Orpheon, to be sung tenderly:
//
//   introduction  the flute alone sings the last line ("oh Danny boy, I love you so") over the harp
//   verse 1       the tenor alone; the choir from "But come ye back", the tune in the soprano,
//                 where the strings and the bass come in
//   verse 2       the women alone for its first half; everyone from "And I shall hear"
//   climax        "But come ye back when summer's in the meadow" once more, the whole band, the
//                 flute an octave over the soprano and the timpani under "here"
//   ending        "Oh Danny boy, oh Danny boy, I love you so" at two thirds of the pace, softly, held
//
// The harmony (E flat with its A flat and B flat, the C minor and F minor chords of "oh Danny boy",
// the six-four over B flat under "shadow") was written by hand: no voice crosses another, no
// parallel fifths or octaves. Words, tune and harmony are in the public domain. Two words are
// spelled for the singer as they sound ("I'll" as "Isle", "Ye'll" as "Yeel"); the captions keep
// Weatherly's spelling.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, held, moved, readNotes, readPlain, startsOf, stretched, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 66;
const METER = 4;
/** Beats of the flute's introduction before the first upbeat ("Oh Dan-ny"). */
const INTRO = 8;
/** Beats the last chord is held beyond its note. */
const FINAL = 4;
/** The ending's lengths, against the song's pace. */
const BROADEN = 1.5;

// ── the tune, line by line: each line is eight beats from its upbeat (three eighths) to the next ──

/** The first half of a verse. "call-ing" and "fall-ing" carry their first syllable over two notes. */
const FIRST_1 =
  "D4:.5 Eb4:.5 F4:.5 | G4:1.5 F4:.5 G4:.5 C5:.5 Bb4:.5 G4:.5 | F4:.5 ~Eb4:.5 C4 R:.5 Eb4:.5 G4:.5 Ab4:.5 | Bb4:1.5 C5:.5 Bb4:.5 G4:.5 Eb4:.5 G4:.5 | F4:2 R:.5 " +
  "D4:.5 Eb4:.5 F4:.5 | G4:1.5 F4:.5 G4:.5 C5:.5 Bb4:.5 G4:.5 | F4:.5 ~Eb4:.5 C4 R:.5 D4:.5 Eb4:.5 F4:.5 | G4:1.5 Ab4:.5 G4:.5 F4:.5 Eb4:.5 F4:.5 | Eb4:2 R:.5";
/** The second verse's first line has a syllable more ("flow-ers are dy-ing"): no carried note. */
const FIRST_2 = FIRST_1.replace("F4:.5 ~Eb4:.5 C4 R:.5 Eb4:.5", "F4:.5 Eb4:.5 C4 R:.5 Eb4:.5");

/** The second half, line by line, in four parts. */
const SECOND = {
  Soprano: [
    "Bb4:.5 C5:.5 D5:.5 | Eb5:1.5 D5:.5 D5:.5 C5:.5 Bb4:.5 C5:.5 | Bb4:.5 ~G4:.5 Eb4 R:.5",
    "Bb4:.5 C5:.5 D5:.5 | Eb5:1.5 D5:.5 D5:.5 C5:.5 Bb4:.5 G4:.5 | F4:2 R:.5",
    "Bb4:.5 Bb4:.5 Bb4:.5 | G5:1.5 F5:.5 F5:.5 Eb5:.5 C5:.5 Eb5:.5 | Bb4:.5 ~G4:.5 Eb4 R:.5",
    "D4:.5 Eb4:.5 F4:.5 | G4:.5 C5:.5 Bb4:.5 G4:.5 F4:.5 Eb4:.5 C4:.5 D4:.5 | Eb4:2",
  ],
  Alto: [
    "F4:.5 F4:.5 Ab4:.5 | G4:1.5 F4:.5 F4:.5 Ab4:.5 G4:.5 Ab4:.5 | Eb4 Bb3 R:.5",
    "F4:.5 F4:.5 Ab4:.5 | G4:1.5 F4:.5 F4:.5 Ab4:.5 G4:.5 Eb4:.5 | D4:2 R:.5",
    "D4:.5 F4:.5 Ab4:.5 | Bb4:1.5 Bb4:.5 Bb4:.5 C5:.5 Ab4:.5 C5:.5 | G4 Bb3 R:.5",
    "Bb3:.5 Bb3:.5 D4:.5 | Eb4:.5 Eb4:.5 G4:.5 Eb4:.5 C4:.5 C4:.5 Ab3:.5 Ab3:.5 | Bb3:2",
  ],
  Tenor: [
    "D4:.5 D4:.5 D4:.5 | Bb3:1.5 Bb3:.5 Bb3:.5 C4:.5 Eb4:.5 Eb4:.5 | Bb3 G3 R:.5",
    "D4:.5 D4:.5 D4:.5 | Bb3:1.5 Bb3:.5 Bb3:.5 C4:.5 Eb4:.5 G3:.5 | Bb3:2 R:.5",
    "Bb3:.5 Bb3:.5 D4:.5 | Eb4:1.5 D4:.5 D4:.5 G4:.5 Eb4:.5 Eb4:.5 | Eb4 G3 R:.5",
    "F3:.5 G3:.5 Ab3:.5 | Bb3:.5 C4:.5 Eb4:.5 G3:.5 Ab3:.5 G3:.5 F3:.5 F3:.5 | G3:2",
  ],
  Bass: [
    "Bb2:.5 Bb2:.5 Bb2:.5 | Eb3:1.5 Bb2:.5 Bb2:.5 Ab2:.5 Eb3:.5 C3:.5 | Eb3 Eb3 R:.5",
    "Bb2:.5 Bb2:.5 Bb2:.5 | Eb3:1.5 Bb2:.5 Bb2:.5 Ab2:.5 Eb3:.5 Eb3:.5 | Bb2:2 R:.5",
    "Bb2:.5 Bb2:.5 Bb2:.5 | Eb3:1.5 Bb2:.5 Bb2:.5 Eb3:.5 Ab2:.5 Ab2:.5 | Bb2 Eb3 R:.5",
    "Bb2:.5 Bb2:.5 Bb2:.5 | Eb3:.5 Ab2:.5 G2:.5 C3:.5 Ab2:.5 C3:.5 F2:.5 Bb2:.5 | Eb3:2",
  ],
};
type Voice = keyof typeof SECOND;
const VOICES = Object.keys(SECOND) as Voice[];
/** The second half whole: its four lines, a breath after the last. */
const second = (v: Voice) => `${SECOND[v].join(" ")} R:.5`;
/** Its first three lines: "But come ye back" to "in sunshine or in shadow". */
const climax = (v: Voice) => SECOND[v].slice(0, 3).join(" ");
/** Its last line at two thirds of the pace, the last chord held. */
const ending = (v: Voice) => held(stretched(SECOND[v][3], BROADEN), FINAL);

/** The alto with the tune for the second verse's first half, in thirds and sixths under it. */
const ALTO_FIRST =
  "Bb3:.5 C4:.5 D4:.5 | Eb4:1.5 D4:.5 Eb4:.5 Eb4:.5 D4:.5 Eb4:.5 | D4:.5 C4:.5 Ab3 R:.5 C4:.5 Eb4:.5 F4:.5 | G4:1.5 Ab4:.5 G4:.5 Eb4:.5 C4:.5 Eb4:.5 | D4:2 R:.5 " +
  "Bb3:.5 C4:.5 D4:.5 | Eb4:1.5 D4:.5 Eb4:.5 Eb4:.5 D4:.5 Eb4:.5 | D4 Ab3 R:.5 Bb3:.5 C4:.5 D4:.5 | Eb4:1.5 F4:.5 Eb4:.5 D4:.5 C4:.5 D4:.5 | Bb3:2 R:.5";

// ── the words ──

/** The words as sung: a breath (a comma) only where a line ends; the captions keep the punctuation. */
const WORDS = {
  first1: "Oh Dan-ny boy the pipes the pipes are call-ing, from glen to glen and down the moun-tain side. The sum-mer's gone and all the ros-es fall-ing, 'tis you 'tis you must go and I must bide.",
  second1: "But come ye back when sum-mer's in the mea-dow, or when the val-ley's hushed and white with snow, 'tis Isle be here in sun-shine or in sha-dow, oh Dan-ny boy oh Dan-ny boy I love you so!",
  first2: "But when ye come and all the flow-ers are dy-ing, if I am dead as dead I well may be, Yeel come and find the place where I am ly-ing, and kneel and say an A-ve there for me.",
  second2: "And I shall hear though soft you tread a-bove me, and all my grave will warm-er sweet-er be, for you will bend and tell me that you love me, and I shall sleep in peace un-til you come to me!",
};
const LINES: Record<string, string[]> = {
  first1: ["Oh Dan·ny boy, the pipes, the pipes are call·ing", "from glen to glen, and down the moun·tain side.", "The sum·mer’s gone, and all the ros·es fall·ing,", "’Tis you, ’tis you must go and I must bide."],
  second1: ["But come ye back when sum·mer’s in the mea·dow,", "or when the val·ley’s hushed and white with snow,", "’Tis I’ll be here in sun·shine or in sha·dow,", "oh Dan·ny boy, oh Dan·ny boy, I love you so!"],
  first2: ["But when ye come, and all the flow·ers are dy·ing,", "if I am dead, as dead I well may be,", "ye’ll come and find the place where I am ly·ing,", "and kneel and say an A·ve there for me."],
  second2: ["And I shall hear, though soft you tread a·bove me,", "and all my grave will warm·er, sweet·er be,", "for you will bend and tell me that you love me,", "and I shall sleep in peace un·til you come to me!"],
};
/** Caption lines for a stretch of a verse (in English already: no line under them, as in grace.ts). */
const lines = (key: string, from = 0, to = 4): [string, string][] => LINES[key].slice(from, to).map((text) => [text, ""]);
const words = (key: string, from = 0, to = 4) => readPlain(WORDS[key as keyof typeof WORDS]).slice(...wordSpan(key, from, to));
/** The syllables of caption lines `from`..`to` of a stretch, by counting their pieces. */
function wordSpan(key: string, from: number, to: number): [number, number] {
  const count = (k: number) => LINES[key].slice(0, k).reduce((n, line) => n + line.split(/·| /).filter(Boolean).length, 0);
  return [count(from), count(to)];
}

const SONG: Section[] = [
  // the tenor alone, an octave under the tune
  { words: words("first1"), tune: FIRST_1, parts: { Tenor: moved(FIRST_1, -12) }, lines: lines("first1") },
  // the choir from "But come ye back"
  { words: words("second1"), tune: second("Soprano"), parts: Object.fromEntries(VOICES.map((v) => [v, second(v)])), lines: lines("second1") },
  // the women alone
  { words: words("first2"), tune: FIRST_2, parts: { Soprano: FIRST_2, Alto: ALTO_FIRST }, lines: lines("first2") },
  // everyone
  { words: words("second2"), tune: second("Soprano"), parts: Object.fromEntries(VOICES.map((v) => [v, second(v)])), lines: lines("second2") },
  // "But come ye back" once more, with everything
  { words: words("second1", 0, 3), tune: climax("Soprano"), parts: Object.fromEntries(VOICES.map((v) => [v, climax(v)])), lines: lines("second1", 0, 3) },
  // the last line, broadened and held
  { words: words("second1", 3, 4), tune: ending("Soprano"), parts: Object.fromEntries(VOICES.map((v) => [v, ending(v)])), lines: lines("second1", 3, 4) },
];

// ── the band, from the chords: line by line, the chord on each stretch of beats ──

const CHORDS = {
  first: [
    "Bb:1.5 Eb:1.5 Bb:.5 Eb:.5 Ab:.5 Bb:.5 Eb:.5 Bb7:.5 Ab:2",
    "Cm:.5 Eb:.5 Fm:.5 Eb:1.5 Ab:.5 Eb:1 Ab:.5 Eb:.5 Bb:2.5",
    "Bb:.5 Cm:.5 Bb:.5 Eb:1.5 Bb:.5 Eb:.5 Ab:.5 Bb:.5 Eb:.5 Bb7:1 Ab:1.5",
    "Bb:.5 Cm:.5 Bb:.5 Eb:1.5 Fm:.5 Eb:.5 Bb:.5 Ab:.5 Bb:.5 Eb:2.5",
  ],
  second: [
    "Bb:1 Bb7:.5 Eb:1.5 Bb:1 Ab:.5 Eb:.5 Ab/C:.5 Eb:2.5",
    "Bb:1 Bb7:.5 Eb:1.5 Bb:1 Ab:.5 Eb:1 Bb:2.5",
    "Bb:1 Bb7:.5 Eb:1.5 Bb:1 Cm:.5 Ab:1 Eb/Bb:1 Eb:1.5",
    "Bb:.5 Eb/Bb:.5 Bb7:.5 Eb:.5 Ab:.5 Eb/G:.5 Cm:.5 Fm/Ab:.5 Cm:.5 Fm:.5 Bb7:.5 Eb:2.5",
  ],
};
const ENDING_CHORDS = `${stretched(CHORDS.second[3].replace(/Eb:2\.5$/, "Eb:2"), BROADEN)} Eb:${FINAL}`;

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClass = (name: string) => (STEP[name[0]] + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0) + 12) % 12;

interface Chord {
  t: number;
  d: number;
  bass: number;
  tones: number[];
}

/** Chords ("symbol:beats") from song beat `t` on. */
function chordsFrom(src: string, t: number): Chord[] {
  const out: Chord[] = [];
  for (const token of src.split(/\s+/).filter(Boolean)) {
    const [symbol, beats] = token.split(":");
    const m = /^([A-G][#b]?)(m?)(7?)(?:\/([A-G][#b]?))?$/.exec(symbol);
    if (!m) throw new Error(`not a chord: "${symbol}"`);
    const root = pitchClass(m[1]);
    const tones = [root, (root + (m[2] ? 3 : 4)) % 12, (root + 7) % 12, ...(m[3] ? [(root + 10) % 12] : [])];
    out.push({ t, d: Number(beats), bass: m[4] ? pitchClass(m[4]) : root, tones });
    t += Number(beats);
  }
  return out;
}

/** The pitch of pitch class `pc` from `lo` up. */
const from = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);
/** A chord's notes for a harp's hand in the middle (D4 up to C#5), lowest first. */
const middle = (c: Chord) => c.tones.map((pc) => from(pc, 62)).sort((a, b) => a - b);

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const halves = ["first", "second", "first", "second"] as const;
  const chords = [
    // the introduction: the last line's chords
    ...chordsFrom(CHORDS.second[3], -INTRO),
    ...halves.flatMap((h, i) => chordsFrom(CHORDS[h].join(" "), starts[i])),
    ...chordsFrom(CHORDS.second.slice(0, 3).join(" "), starts[4]),
    ...chordsFrom(ENDING_CHORDS, starts[5]),
  ];
  const chordAt = (b: number) => chords.find((c) => b >= c.t - 1e-9 && b < c.t + c.d - 1e-9) ?? chords[chords.length - 1];
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const sectionAt = (b: number) => starts.reduce((k, s, j) => (b >= s - 1e-9 ? j : k), 0);
  /** Where a beat falls in its bar of four: bars start on song beat 1.5, 5.5 ... after the upbeat. */
  const inBar = (b: number) => (((b - 1.5) % 4) + 4) % 4;
  const last = beats - FINAL - 2 * BROADEN;
  const harp: BandNote[] = [];
  const strings: BandNote[] = [];
  const flute: BandNote[] = [];
  const bass: BandNote[] = [];
  const timpani: BandNote[] = [];

  // the flute sings the last line, an octave up, over rolled harp chords
  let t = -INTRO;
  for (const n of readNotes(SECOND.Soprano[3])) {
    if (n.midi) flute.push(note(at(t), n.midi + 12, n.beats * beat, n.beats > 1 ? 0.6 : 0.7));
    t += n.beats;
  }
  for (const c of chords.filter((c) => c.t < 0)) [from(c.bass, 39), ...middle(c)].forEach((m, k) => harp.push(note(at(c.t) + 0.06 * k, m, 2.4, 0.4)));

  // the harp's eighths, from the tenor's first note to the ending: down to the bass, up through the chord and back
  for (let b = 0; b < starts[5] - 1e-9; b += 0.5) {
    const c = chordAt(b);
    const s = sectionAt(b);
    const tones = middle(c);
    const k = Math.round(inBar(b) * 2) % 8;
    const pattern = [from(c.bass, 39), tones[0], tones[1], tones[2], tones[0] + 12, tones[2], tones[1], tones[0]];
    const loud = [0.3, 0.36, 0.32, 0.38, 0.46][s];
    harp.push(note(at(b), pattern[k], 1.6, k === 0 ? loud + 0.1 : loud));
  }
  // the ending: each chord rolled, then the last one upward through four octaves
  for (const c of chords.filter((c) => c.t >= starts[5] - 1e-9 && c.t < last - 1e-9)) [from(c.bass, 39), ...middle(c)].forEach((m, k) => harp.push(note(at(c.t) + 0.06 * k, m, 3, 0.36)));
  const end = chordAt(last);
  [from(end.bass, 39), from(end.bass, 39) + 12, ...middle(end), ...middle(end).map((m) => m + 12), middle(end)[0] + 24].forEach((m, k) => harp.push(note(at(last) + 0.08 * k, m, 6, 0.42)));

  // the strings hold three notes of each chord from "But come ye back" to the end, each moving to
  // the nearest note of the next chord: softly under the women, fully in the climax
  const ranges = [[55, 67], [60, 72], [64, 76]];
  const now = [58, 63, 67];
  const open: (BandNote | null)[] = [null, null, null];
  for (const c of chords.filter((c) => c.t >= starts[1] - 1e-9)) {
    const taken: number[] = [];
    const level = [0, 0.5, 0.42, 0.6, 0.8, 0.45][sectionAt(c.t)];
    for (const v of [2, 1, 0]) {
      const options = Array.from({ length: ranges[v][1] - ranges[v][0] }, (_, k) => ranges[v][0] + k).filter((m) => c.tones.includes(m % 12) && !taken.includes(m % 12));
      const m = options.reduce((best, x) => (Math.abs(x - now[v]) < Math.abs(best - now[v]) ? x : best), options[0]);
      taken.push(m % 12);
      now[v] = m;
      const o = open[v];
      if (o && o.midi === m) continue;
      if (o) o.d = at(c.t) - o.t;
      open[v] = note(at(c.t), m, 0, level);
      strings.push(open[v]!);
    }
  }
  for (const o of open) if (o) o.d = at(beats) - o.t;

  // the double bass: the chord's bass an octave under the choir, on the first and third beats,
  // from "But come ye back"; once a bar under the women; on each chord of the ending
  for (let b = starts[1]; b < starts[5] - 1e-9; b += 0.5) {
    const s = sectionAt(b);
    const place = inBar(b);
    if (!(Math.abs(place) < 1e-9 || (s !== 2 && Math.abs(place - 2) < 1e-9))) continue;
    bass.push(note(at(b), from(chordAt(b).bass, 34), beat * 1.8, s === 4 ? 0.85 : 0.65));
  }
  for (const c of chords.filter((c) => c.t >= starts[5] - 1e-9 && c.t < last - 1e-9)) bass.push(note(at(c.t), from(c.bass, 34), c.d * beat, 0.5));
  bass.push(note(at(last), from(end.bass, 34), beat * FINAL, 0.7));

  // the climax: the flute an octave over the soprano; the timpani roll into "back" and under "here"
  t = starts[4];
  for (const n of readNotes(SONG[4].tune)) {
    if (n.midi) flute.push(note(at(t), n.midi + 12, n.beats * beat, 0.5));
    t += n.beats;
  }
  const roll = (b: number, beats: number, midi: number, v0: number, v1: number) => {
    for (let q = 0; q < beats * 4; q++) timpani.push(note(at(b + q / 4), midi, 0.3, v0 + ((v1 - v0) * q) / (beats * 4)));
  };
  roll(starts[4] - 1.5, 1.5, 46, 0.15, 0.5);
  roll(starts[4] + 16, 1.5, 46, 0.2, 0.55);
  timpani.push(note(at(starts[4] + 17.5), 39, 0.6, 0.7));
  // and a soft roll under the last chord
  roll(last, FINAL, 39, 0.3, 0.1);
  // the flute's last word: the tonic, held with the choir
  flute.push(note(at(last), 75, FINAL * beat, 0.35));

  return [writtenPart("harp", harp), writtenPart("strings", strings), writtenPart("flute", flute), writtenPart("bass", bass), writtenPart("timpani", timpani)];
}

export const DANNY: Song = {
  id: "danny",
  title: "Danny boy",
  credit: "Irish tune “Londonderry air”, printed 1855; words by Frederic Weatherly, 1913; arrangement written for Orpheon",
  lang: "en",
  meter: METER,
  bpm: BPM,
  ...writtenTune(SONG, METER, true),
  voices: [
    writtenVoice(SONG, { name: "Soprano", body: "soprano" }, METER, true),
    writtenVoice(SONG, { name: "Alto", body: "alto" }, METER, true),
    writtenVoice(SONG, { name: "Tenor", body: "tenor" }, METER, true),
    writtenVoice(SONG, { name: "Bass", body: "bass" }, METER, true),
  ],
  intro: INTRO,
  band: { instruments: ["harp", "strings", "flute", "bass", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
