// "Amazing grace": John Newton's words (1779) on the American tune "New Britain" (1829), for
// four voices with harp, strings, a double bass, an esraj and timpani. Written for Orpheon, to
// be sung slowly and close:
//
//   introduction  the esraj alone sings the last line ("was blind, but now I see") over the harp
//   verse 1       the soprano alone; the alto joins her in thirds and sixths at "I once was lost"
//   verse 2       the men alone, the tenor with the tune; the whole choir from "How precious",
//                 where the strings come in
//   verse 3       a semitone higher (G to A flat): everyone, the band full, the esraj with the tune
//   ending        "and grace will lead me home" once more at half the pace, held
//
// The harmony is the hymn's own kind (a descending bass G F# E under "grace how sweet", a
// cadential 6/4 under "wretch like", C to G/D under "lost but now am found"), voiced by hand:
// no voice crosses another, no parallel fifths or octaves. All of it is in the public domain.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Chord, type Section, chordsOf, held, moved, readNotes, readPlain, startsOf, stretched, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 68;
const METER = 3;
/** Beats of the esraj's introduction before the first pickup ("A-"). */
const INTRO = 9;
/** Beats the last chord is held beyond its note. */
const FINAL = 6;
/** The last verse a semitone up. */
const LIFT = 1;

// ── the four parts of a verse in G, line by line (lines 1-2: 24 beats; lines 3-4: 21) ──
// Melismas ("~") are the tune's own: "a-ma-zing", "saved a", "once was", "now am", "but now".
const S1 = "D4 | G4:2 B4:.5 ~G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:.5 ~G4:.5 | B4:2 A4 | D5:5";
const S2 = "B4 | D5:1.5 ~B4:.5 D5:.5 ~B4:.5 | G4:2 D4 | E4:1.5 ~G4:.5 G4:.5 ~E4:.5 | D4:2 D4 | G4:2 B4:.5 ~G4:.5 | B4:2 A4 | G4:2";
const A1 = "B3 | D4:2 D4 | D4:2 D4 | E4:2 C4 | B3:2 C4 | D4:2 D4 | G4:2 F#4 | G4:3 ~F#4:2";
const A2 = "G4 | G4:2 G4 | E4:2 B3 | C4:2 C4 | B3:2 C4 | D4:2 D4 | G4:2 F#4 | D4:2";
const T1 = "G3 | B3:2 B3 | G3:2 A3 | B3:2 G3 | G3:2 F#3 | B3:2 B3 | D4:2 C4 | B3:3 ~A3:2";
const T2 = "B3 | G3:2 D4 | G3:2 G3 | G3:2 G3 | G3:2 F#3 | B3:2 B3 | D4:2 C4 | B3:2";
const B1 = "G2 | G2:2 G2 | G2:2 F#2 | E2:2 C3 | D3:2 D3 | G2:2 G2 | D3:2 D3 | G2:3 ~D3:2";
const B2 = "G2 | B2:2 G2 | C3:2 D3 | C3:2 C3 | D3:2 D3 | G2:2 G2 | D3:2 D3 | G2:2";
/**
 * Verse 2's last two lines: "the hour I first believed". "Hour" is two syllables to the reader
 * ("how-er"), as a choir sings it on a held note: the note under it is parted 1½ + ½ in every part.
 */
const hour = (src: string, from: string, to: string) => {
  if (src.split(from).length !== 2) throw new Error(`"${from}" is not once in "${src}"`);
  return src.replace(from, to);
};
const S2H = hour(S2, "| G4:2 B4:.5 ~G4:.5 |", "| G4:1.5 G4:.5 B4:.5 ~G4:.5 |");
const A2H = hour(A2, "| D4:2 D4 | G4:2", "| D4:1.5 D4:.5 D4 | G4:2");
const T2H = hour(T2, "| B3:2 B3 |", "| B3:1.5 B3:.5 B3 |");
const B2H = hour(B2, "| G2:2 G2 |", "| G2:1.5 G2:.5 G2 |");
/** Verse 1's last two lines for the alto alone with the tune: thirds and sixths under it. */
const DUET = "G4 | B4:2 G4 | E4:2 B3 | C4:2 C4 | B3:2 B3 | B3:2 D4 | G4:2 F#4 | B3:2";
/** The last line alone, each part (9 beats): the introduction's harmony, and the ending's. */
const LAST = { S: "D4 G4:2 B4:.5 ~G4:.5 B4:2 A4 G4:2", A: "C4 D4:2 D4 G4:2 F#4 D4:2", T: "F#3 B3:2 B3 D4:2 C4 B3:2", B: "D3 G2:2 G2 D3:2 D3 G2:2" };

const VERSES = [
  "A-ma-zing grace how sweet the sound, that saved a wretch like me. I once was lost but now am found, was blind but now I see.",
  "'Twas grace that taught my heart to fear, and grace my fears re-lieved. How pre-cious did that grace ap-pear, the how-er I first be-lieved.",
  "Through ma-ny dan-gers toils and snares, I have al-rea-dy come. 'Tis grace hath brought me safe thus far, and grace will lead me home.",
].map(readPlain);

const LINES: [string, string][][] = [
  [["A·ma·zing grace, how sweet the sound", ""], ["that saved a wretch like me!", ""], ["I once was lost, but now am found,", ""], ["was blind, but now I see.", ""]],
  [["’Twas grace that taught my heart to fear,", ""], ["and grace my fears re·lieved;", ""], ["how pre·cious did that grace ap·pear", ""], ["the hou·r I first be·lieved!", ""]],
  [["Through ma·ny dan·gers, toils and snares", ""], ["I have al·rea·dy come;", ""], ["’Tis grace hath brought me safe thus far,", ""], ["and grace will lead me home.", ""]],
];

const up = (src: string) => moved(src, LIFT);
const ending = (src: string) => up(held(stretched(src, 2), FINAL));

const SONG: Section[] = [
  // the soprano alone; the alto with her from "I once was lost"
  { words: VERSES[0], tune: `${S1} ${S2}`, parts: { Soprano: `${S1} ${S2}`, Alto: `R:24 ${DUET}` }, lines: LINES[0] },
  // the men alone, the tenor with the tune an octave under it; everyone from "How precious"
  { words: VERSES[1], tune: `${S1} ${S2H}`, parts: { Soprano: `R:24 ${S2H}`, Alto: `R:24 ${A2H}`, Tenor: `${moved(S1, -12)} ${T2H}`, Bass: `${B1} ${B2H}` }, lines: LINES[1] },
  // a bar for the band alone (the new key's dominant), then a semitone higher, everyone
  { words: VERSES[2], tune: `R:3 ${up(`${S1} ${S2}`)}`, parts: { Soprano: `R:3 ${up(`${S1} ${S2}`)}`, Alto: `R:3 ${up(`${A1} ${A2}`)}`, Tenor: `R:3 ${up(`${T1} ${T2}`)}`, Bass: `R:3 ${up(`${B1} ${B2}`)}` }, lines: LINES[2] },
  // the last line again, broadened, held
  {
    words: readPlain("and grace will lead me home."),
    tune: ending(LAST.S),
    parts: { Soprano: ending(LAST.S), Alto: ending(LAST.A), Tenor: ending(LAST.T), Bass: ending(LAST.B) },
    lines: [["and grace will lead me home.", ""]],
  },
];

// ── the band, from the written harmony ──

/** The whole song's chords: each section's four parts (the full harmony, whoever sings), bass first. */
function harmony(): Chord[] {
  const { starts } = startsOf(SONG);
  const verse = [`${B1} ${B2}`, `${T1} ${T2}`, `${A1} ${A2}`, `${S1} ${S2}`];
  return [
    ...chordsOf([LAST.B, LAST.T, LAST.A, LAST.S], -INTRO),
    ...chordsOf(verse, starts[0]),
    ...chordsOf(verse, starts[1]),
    ...chordsOf(verse.map((p) => `R:3 ${up(p)}`), starts[2]),
    ...chordsOf([ending(LAST.B), ending(LAST.T), ending(LAST.A), ending(LAST.S)], starts[3]),
  ];
}

/** A chord's notes placed for a harp's hand in the middle (D4 up to C#5), lowest first. */
const middle = (c: Chord) => [...new Set(c.notes.slice(1).map((m) => 62 + ((((m - 62) % 12) + 12) % 12)))].sort((a, b) => a - b);

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  // (the bridge bar's rests are no chord: it is written out below)
  const chords = harmony().filter((c) => c.notes.every((m) => m > 0));
  const chordAt = (b: number) => chords.find((c) => b >= c.t - 1e-9 && b < c.t + c.d - 1e-9) ?? chords[chords.length - 1];
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const harp: BandNote[] = [];
  const strings: BandNote[] = [];
  const esraj: BandNote[] = [];
  const bass: BandNote[] = [];
  const timpani: BandNote[] = [];
  const end = starts[3];
  const last = beats - FINAL;
  /** A bar starts on song beat 1, 4, 7 ... (the song opens on a pickup, the third beat). */
  const barStart = (b: number) => (((b - 1) % 3) + 3) % 3 === 0;

  // the esraj sings the last line alone over rolled harp chords
  let t = -INTRO;
  for (const n of readNotes(LAST.S)) {
    if (n.midi && !n.melisma) esraj.push(note(at(t), n.midi, n.beats * beat, 0.72));
    else if (n.midi) esraj.push(note(at(t), n.midi, n.beats * beat, 0.6));
    t += n.beats;
  }
  for (const c of chords.filter((c) => c.t < 0)) {
    [c.notes[0], ...middle(c)].forEach((m, k) => harp.push(note(at(c.t) + 0.06 * k, m, 2.6, 0.42)));
  }

  for (let b = 0; b < end; b++) {
    if (b >= starts[2] && b < starts[2] + 3) continue;
    const c = chordAt(b);
    const verse = b < starts[1] ? 0 : b < starts[2] ? 1 : 2;
    const tones = middle(c);
    const lineThree = b - starts[verse] >= 24;
    // the harp: a rolled chord a bar while the soprano sings alone; then flowing eighths
    if (verse === 0 && !lineThree) {
      if (barStart(b)) [c.notes[0], ...tones].forEach((m, k) => harp.push(note(at(b) + 0.07 * k, m, 2.8, 0.4)));
    } else {
      const top = verse === 2 ? 12 : 0;
      for (let e = 0; e < 2; e++) {
        const x = barStart(b) ? 0 : barStart(b - 1) ? 2 : 4;
        const pattern = [c.notes[0], tones[0], tones[1] ?? tones[0], (tones[2] ?? tones[1] ?? tones[0]) + top, tones[1] ?? tones[0], tones[0] + top];
        const k = x + e;
        const ce = chordAt(b + e / 2);
        const midi = k === 0 ? ce.notes[0] : pattern[k];
        harp.push(note(at(b + e / 2), midi, 2.2, k === 0 ? 0.5 : 0.32 + 0.04 * (k % 3) + (verse === 2 ? 0.06 : 0)));
      }
    }
    // the double bass: an octave under the choir's bass, on each bar, from verse 1's third line
    if (barStart(b) && (verse > 0 || lineThree)) bass.push(note(at(b), c.notes[0] - 12, beat * 2.4, verse === 2 ? 0.85 : 0.7));
  }

  // the strings hold the three lower parts from "How precious" to the end, moving as they move
  for (let v = 0; v < 3; v++) {
    let open: BandNote | null = null;
    for (const c of chords.filter((c) => c.t >= starts[1] + 24)) {
      const m = c.notes[v] + (v === 0 ? 12 : 0);
      if (open && open.midi === m) continue;
      if (open) open.d = at(c.t) - open.t;
      open = note(at(c.t), m, 0, c.t >= starts[2] ? 0.7 : 0.55);
      strings.push(open);
    }
    if (open) open.d = at(beats) - open.t;
  }

  // the esraj with the tune in the last verse and the ending, softly under the soprano
  t = starts[2];
  for (const section of [SONG[2], SONG[3]]) {
    for (const n of readNotes(section.tune)) {
      if (n.midi) esraj.push(note(at(t), n.midi, n.beats * beat, 0.45));
      t += n.beats;
    }
  }

  // the bridge into A flat: its dominant, E flat seven, a bar alone, the timpani rolling softly under it
  const bridge = starts[2];
  // (what the strings held of the second verse stops where the bridge begins)
  for (const n of strings) if (n.t < at(bridge) - 1e-6 && n.t + n.d > at(bridge)) n.d = at(bridge) - n.t;
  [51, 55, 58, 61].forEach((m) => strings.push(note(at(bridge), m, 3 * beat + 0.05, 0.6)));
  [39, 51, 55, 58, 61, 63, 67].forEach((m, k) => harp.push(note(at(bridge) + 0.07 * k, m, 3, 0.45)));
  bass.push(note(at(bridge), 39, beat * 2.6, 0.75));
  for (let q = 0; q < 9; q++) timpani.push(note(at(bridge + q / 3), 51, 0.4, 0.2 + 0.035 * q));
  // the ending: the harp rolls each chord, then the last one upward through four octaves
  for (const c of chords.filter((c) => c.t >= end && c.t < last - 1e-9)) [c.notes[0], ...middle(c)].forEach((m, k) => harp.push(note(at(c.t) + 0.06 * k, m, 3, 0.4)));
  const finalChord = chordAt(last);
  const root = finalChord.notes[0];
  [root, root + 12, ...middle(finalChord), ...middle(finalChord).map((m) => m + 12), middle(finalChord)[0] + 24].forEach((m, k) => harp.push(note(at(last) + 0.07 * k, m, 6, 0.5)));
  bass.push(note(at(last), root - 12, beat * FINAL, 0.8));
  for (let q = 0; q < FINAL * 3; q++) timpani.push(note(at(last + q / 3), root, 0.4, 0.25 + 0.3 * Math.sin((Math.PI * (q + 1)) / (FINAL * 3 + 1))));

  return [writtenPart("harp", harp), writtenPart("strings", strings), writtenPart("esraj", esraj), writtenPart("bass", bass), writtenPart("timpani", timpani)];
}

export const GRACE: Song = {
  id: "grace",
  title: "Amazing grace",
  credit: "American tune “New Britain”, 1829; words by John Newton, 1779; arrangement written for Orpheon",
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
  band: { instruments: ["harp", "strings", "esraj", "bass", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
