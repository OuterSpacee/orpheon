// Rabindranath Tagore's "Anandaloke Mangalaloke" (1893), in Bengali, for four voices and a band
// of tanpura, sarod, esraj and tabla. The tune is Tagore's as Kangalicharan Sen notated it (ektal:
// twelve beats, written here as four bars of three), a fourth up from the notation's C so it sits
// in the soprano. The form: the refrain twice, the voices coming in one by one (the soprano alone,
// the alto under her, then the tenor, then the bass); the first verse line by the men and again by
// the women; its second line by everyone; the refrain once more in four parts, the last chord held.
// The harmony and the band were written for Orpheon.
//
// Bengali is sung from IPA, as it is sung: the inherent vowel sounded ([o] at a word's end), the
// plain stops unaspirated ("˭"), ভ and ঝ breathy ("ʱ"). The voice has no dental stop, so the dental
// ত and দ are its alveolar t and d; the IPA reader drops ˭ and ʱ (the stop itself stays) and sings
// ɦ as h, ʈ as t, tɕ and dʑ as tʃ and dʒ. No Bengali speaker has checked the diction yet.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, held, readSyllables, startsOf, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 116;
/** Beats the band plays before the voices: one cycle of the tala. */
const INTRO = 12;
/** Beats the last chord is held beyond its bars. */
const FINAL = 3;

// আনন্দলোকে মঙ্গলালোকে বিরাজ সত্যসুন্দর
const REFRAIN = readSyllables(`
  আ /a/ ; ন n/ɔ/n ; ন্দ d/o/ ; লো l/o/ ; কে k˭/e/,
  ম m/ɔ/ŋ ; ঙ্গ g/o/ ; লা l/a/ ; লো l/o/ ; কে k˭/e/,
  বি b/i/ ; রা ɾ/a/ ; জ dʑ/o/,
  স ʃ/o/t ; ত্য t˭/o/_ ; সু ʃ/u/n ; ন্দ d/o/ ; র ɾ/o/,
`);
// মহিমা তব উদ্ভাসিত মহাগগনমাঝে
const VERSE_1 = readSyllables(`
  ম m/o/ ; হি ɦ/i/ ; মা m/a/_ ; ত t˭/ɔ/ ; ব b/o/_
  উ /u/d ; দ্ভা bʱ/a/ ; সি ʃ/i/ ; ত t˭/o/,
  ম m/ɔ/ ; হা ɦ/a/ ; গ g/ɔ/ ; গ g/o/ ; ন n/o/ ; মা m/a/ ; ঝে dʑʱ/e/,
`);
// বিশ্বজগত মণিভূষণ বেষ্টিত চরণে
const VERSE_2 = readSyllables(`
  বি b/i/ʃ ; শ্ব ʃ/o/ ; জ dʑ/ɔ/ ; গ g/o/ ; ত t˭/o/_
  ম m/o/ ; ণি n/i/ ; ভূ bʱ/u/ ; ষ ʃ/o/ ; ণ n/o/,
  বে b/e/ʃ ; ষ্টি ʈ˭/i/ ; ত t˭/o/_ ; চ tɕ˭/ɔ/ ; র ɾ/o/ ; ণে n/e/,
`);

const REFRAIN_LINES: [string, string][] = [
  ["আ·ন·ন্দ·লো·কে ম·ঙ্গ·লা·লো·কে", "In the realm of joy, in the light of grace,"],
  ["বি·রা·জ স·ত্য·সু·ন্দ·র", "you reign, O True and Beautiful."],
];
const VERSE_1_LINE: [string, string] = ["ম·হি·মা ত·ব উ·দ্ভা·সি·ত ম·হা·গ·গ·ন·মা·ঝে", "Your glory shines across the vast sky;"];
const VERSE_2_LINE: [string, string] = ["বি·শ্ব·জ·গ·ত ম·ণি·ভূ·ষ·ণ বে·ষ্টি·ত চ·র·ণে", "the worlds, a garland of jewels, circle your feet."];

// F major, three beats to the bar. The refrain in two halves of eight bars: the tune, with the
// notation's grace notes (a touch of the note below before "lo" and "jo", the turn on "ro").
const TUNE_1 = "A4:3 | A4:2 A4 | G4:.125 ~A4:2.875 | G4:3 | A4:2 C5 | Bb4:3 | Bb4:2 ~D5 | C5:3";
const TUNE_2 = "F4:3 | G4:3 | G4:.125 ~A4:4.875 ~G4:.5 ~F4:.5 | F4:2 A4 | G4:2 E4 | F4:.25 ~G4:.25 ~F4:5.5";
const ALTO_1 = "F4:3 | F4:2 F4 | F4:3 | E4:3 | F4:2 F4 | F4:3 | G4:3 | G4:3";
const ALTO_2 = "C4:3 | C4:3 | C4:3 ~D4:3 | C4:2 D4 | D4:2 C4 | C4:6";
/** The alto alone under the soprano: in sixths. */
const ALTO_2_DUET = "A3:3 | Bb3:3 | C4:6 | A3:2 C4 | Bb3:2 C4 | A3:6";
const TENOR_1 = "C4:3 | C4:2 C4 | C4:3 | C4:3 | C4:2 C4 | D4:3 | D4:3 | E4:3";
const TENOR_2 = "A3:3 | Bb3:3 | A3:6 | A3:2 A3 | Bb3:2 Bb3 | A3:6";
const BASS_1 = "F3:3 | F3:2 F3 | A2:3 | C3:3 | F3:2 A2 | Bb2:3 | G2:3 | C3:3";
const BASS_2 = "F3:3 | E3:3 | F3:3 ~D3:3 | F3:2 D3 | G2:2 C3 | F3:6";
/** The last cadence falls to the low tonic. */
const BASS_2_LAST = "F3:3 | E3:3 | F3:3 ~D3:3 | F3:2 D3 | G2:2 C3 | F2:6";
const REFRAIN_CHORDS = "F:3 F:3 F/A:3 C:3 F:2 F/A:1 Bb:3 Gm:3 C:3 | F:3 C7/E:3 F:3 Dm:3 F:2 Dm:1 Gm:2 C7:1 F:6";

// The verse's first line (eight bars; its notes are tied over the bar lines), then its second.
const VERSE_1_TUNE = "F4 F4 F4:2 E4 F4 | G4:2 G4:2 F4 E4 | A4 A4:2 A4 Bb4 C5 | Bb4:.5 ~C5:.5 ~Bb4 A4:4";
const VERSE_2_TUNE = "C5:2 C5 C5 C5 B4 | C5 C5 C5:2 C5 B4 | C5:2 C5 B4 C5 D5 | C5:5 ~Bb4";

/** A section, with the band's chords ("chord:beats") and how much the sarod plays in each half (0 the bass notes, 1 a note a beat, 2 broken chords). */
interface Block extends Section {
  chords: string;
  sarod: [number, number];
}

const SONG: Block[] = [
  // the soprano alone, then the alto under her
  { words: REFRAIN, tune: `${TUNE_1} ${TUNE_2}`, parts: { Soprano: `${TUNE_1} ${TUNE_2}`, Alto: `R:24 ${ALTO_2_DUET}` }, chords: REFRAIN_CHORDS, lines: REFRAIN_LINES, sarod: [0, 1] },
  // the tenor joins, then the bass: the choir is whole
  { words: REFRAIN, tune: `${TUNE_1} ${TUNE_2}`, parts: { Soprano: `${TUNE_1} ${TUNE_2}`, Alto: `${ALTO_1} ${ALTO_2}`, Tenor: `${TENOR_1} ${TENOR_2}`, Bass: `R:24 ${BASS_2}` }, chords: REFRAIN_CHORDS, lines: REFRAIN_LINES, sarod: [1, 2] },
  // the verse's first line: the men, the tune in the tenor over the bass in sixths and thirds
  {
    words: VERSE_1, tune: VERSE_1_TUNE, lines: [VERSE_1_LINE], sarod: [1, 1],
    parts: { Tenor: "F3 F3 F3:2 E3 F3 | G3:2 G3:2 F3 E3 | A3 A3:2 A3 Bb3 C4 | Bb3:.5 ~C4:.5 ~Bb3 A3:4", Bass: "A2 A2 A2:2 G2 A2 | Bb2:2 Bb2:2 A2 G2 | F3 F3:2 F3 G3 A3 | G3:2 F3:4" },
    chords: "F/A:4 C/G:1 F/A:1 Gm/Bb:4 F/A:1 C/G:1 F:4 Gm:1 F/A:1 Gm:2 F:4",
  },
  // and again: the women, in thirds (the repeat starts a step higher, as the notation has it)
  {
    words: VERSE_1, tune: VERSE_1_TUNE, lines: [VERSE_1_LINE], sarod: [1, 2],
    parts: { Soprano: "G4 F4 F4:2 E4 F4 | G4:2 G4:2 F4 E4 | A4 A4:2 A4 Bb4 C5 | Bb4:.5 ~C5:.5 ~Bb4 A4:4", Alto: "E4 D4 D4:2 C4 D4 | E4:2 E4:2 D4 C4 | F4 F4:2 F4 G4 A4 | G4:2 F4:4" },
    chords: "C:1 Bb:3 C:1 Bb:1 C:4 Bb:1 C:1 F:4 Gm:1 F/A:1 Gm:2 F:4",
  },
  // its second line: everyone, on the dominant, turning home on the last note
  {
    words: VERSE_2, tune: VERSE_2_TUNE, lines: [VERSE_2_LINE], sarod: [2, 2],
    parts: {
      Soprano: VERSE_2_TUNE,
      Alto: "E4:2 E4 E4 E4 D4 | E4 E4 F4:2 E4 D4 | E4:2 E4 D4 F4 F4 | E4:6",
      Tenor: "G3:2 G3 G3 G3 G3 | G3 G3 A3:2 G3 G3 | G3:2 G3 G3 C4 Bb3 | G3:6",
      Bass: "C3:2 C3 C3 C3 G2 | C3 C3 C3:2 C3 G2 | C3:2 C3 G2 A2 Bb2 | C3:6",
    },
    chords: "C:5 G:1 C:2 F/C:2 C:1 G:1 C:3 G:1 F/A:1 Bb:1 C:5 C7:1",
  },
  // the refrain in four parts, the last chord held
  {
    words: REFRAIN, tune: `${TUNE_1} ${held(TUNE_2, FINAL)}`, lines: REFRAIN_LINES, sarod: [2, 2],
    parts: { Soprano: `${TUNE_1} ${held(TUNE_2, FINAL)}`, Alto: `${ALTO_1} ${held(ALTO_2, FINAL)}`, Tenor: `${TENOR_1} ${held(TENOR_2, FINAL)}`, Bass: `${BASS_1} ${held(BASS_2_LAST, FINAL)}` },
    chords: held(REFRAIN_CHORDS, FINAL),
  },
];

// ── the band's parts, from the chords: on each beat of the song, the bass note's pitch class and the chord's ──

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClass = (name: string) => (STEP[name[0]] + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0) + 12) % 12;

interface Chord {
  bass: number;
  tones: number[];
}

function chord(symbol: string): Chord {
  const m = /^([A-G][#b]?)(m?)(7?)(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error(`not a chord: "${symbol}"`);
  const root = pitchClass(m[1]);
  const tones = [root, (root + (m[2] ? 3 : 4)) % 12, (root + 7) % 12, ...(m[3] ? [(root + 10) % 12] : [])];
  return { bass: m[4] ? pitchClass(m[4]) : root, tones };
}

/** The pitches of these pitch classes from `lo` up to (not including) `hi`, lowest first. */
const within = (pcs: number[], lo: number, hi: number) => Array.from({ length: hi - lo }, (_, k) => lo + k).filter((m) => pcs.includes(m % 12));

/** Ektal's theka (dhin dhin | dhage tirakita | tu na | kat ta | dhage tirakita | dhi na), as strokes on the beats of a cycle. */
const THEKA: [number, Stroke, number][] = [
  [0, "tin", 0.9], [0, "ge", 0.9], [1, "tin", 0.75], [1, "ge", 0.7],
  [2, "na", 0.8], [2, "ge", 0.75], [2.5, "ge", 0.55], [3, "te", 0.5], [3.25, "te", 0.4], [3.5, "te", 0.5], [3.75, "te", 0.4],
  [4, "tin", 0.75], [5, "na", 0.8],
  [6, "kat", 0.7], [7, "na", 0.75],
  [8, "na", 0.8], [8, "ge", 0.75], [8.5, "ge", 0.55], [9, "te", 0.5], [9.25, "te", 0.4], [9.5, "te", 0.5], [9.75, "te", 0.4],
  [10, "tin", 0.75], [10, "ge", 0.7], [11, "na", 0.8],
];
type Stroke = "tin" | "na" | "te" | "ge" | "kat";
/** The tabla's stroke codes (src/band/ranges.ts): the damped "te" is its ti, the flat slap "kat" its ka. */
const STROKE: Record<Stroke, number> = { ge: 0, na: 1, tin: 2, kat: 3, te: 4 };

function band(clock: BeatClock): BandPart[] {
  const { starts, beats } = startsOf(SONG);
  const at = clock.at;
  const beat = clock.beat;
  const length = (i: number) => (starts[i + 1] ?? beats) - starts[i];
  const harmony = SONG.flatMap((b, i) => {
    const per = b.chords.split(/[\s|]+/).filter(Boolean).flatMap((token) => {
      const [symbol, n = "1"] = token.split(":");
      return Array.from({ length: Number(n) }, () => chord(symbol));
    });
    if (per.length !== length(i)) throw new Error(`section ${i + 1}: chords for ${per.length} beats of ${length(i)}`);
    return per;
  });
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  /** The last chord's beat, and the bar after its two: the tala's next first beat. */
  const last = beats - FINAL - 6;
  const sam = beats - FINAL;

  // the tanpura: its four strings in turn, a beat apart, from the first sound to the last chord
  // (fifth, tonic, tonic, low tonic: its own cycle of four against the bars of three)
  const tanpura: BandNote[] = [];
  for (let b = -INTRO; b <= sam; b++) {
    const k = (((b + INTRO) % 4) + 4) % 4;
    tanpura.push(note(at(b), [48, 53, 53, 41][k], 4, k === 3 ? 0.85 : 0.7));
  }

  // the sarod: before the voices, the refrain's last phrase ("satya-sundara"); then the chords, a
  // low note on each bar's first beat and the chord broken over it as the choir fills
  const sarod: BandNote[] = [];
  for (const [b, m, d] of [[-12, 65, 2], [-10, 69, 1], [-9, 67, 2], [-7, 64, 1], [-6, 65, 5]]) sarod.push(note(at(b), m, d * beat, 0.8));
  sarod.push(note(at(-6), 41, 5 * beat, 0.7));
  for (let b = 0; b < last; b++) {
    const i = starts.reduce((k, s, j) => (b >= s ? j : k), 0);
    const density = SONG[i].sarod[b - starts[i] < length(i) / 2 ? 0 : 1];
    const c = harmony[b];
    const tones = within(c.tones, 53, 65);
    const place = (b - starts[i]) % 3;
    if (place === 0) sarod.push(note(at(b), within([c.bass], 41, 53)[0], 2 * beat, 0.85));
    if (density >= 1 && place > 0) sarod.push(note(at(b), tones[place === 1 ? 0 : tones.length - 1], 1.5 * beat, 0.6));
    if (density >= 2) sarod.push(note(at(b + 0.5), tones[1], beat, 0.5));
  }
  // the last chord, rolled upward from the low tonic
  [41, 48, 53, 57, 60, 65, 69, 72].forEach((m, k) => sarod.push(note(at(last) + 0.05 * k, m, 4, 0.8)));

  // the esraj holds two notes of each chord from the alto's entry to the end, each moving to the
  // nearest note of the next chord
  const esraj: BandNote[] = [];
  const ranges = [[53, 63], [60, 72]];
  const now = [57, 65];
  const open: (BandNote | null)[] = [null, null];
  for (let b = 24; b < beats; b++) {
    const c = harmony[b];
    // the upper voice first; the lower takes another note of the chord
    for (const v of [1, 0]) {
      const taken = v === 0 ? now[1] % 12 : -1;
      const options = within(c.tones, ranges[v][0], ranges[v][1]).filter((m) => m % 12 !== taken);
      const m = options.reduce((best, x) => (Math.abs(x - now[v]) < Math.abs(best - now[v]) ? x : best), options[0]);
      now[v] = m;
      const o = open[v];
      if (o && o.midi === m) continue;
      if (o) o.d = at(b) - o.t;
      open[v] = note(at(b), m, 0, 0.7);
      esraj.push(open[v]!);
    }
  }
  for (const o of open) if (o) o.d = at(beats) - o.t;

  // the tabla plays the theka from the tenor's entry, a cycle to each phrase of the refrain, its
  // first beat on the phrase's first syllable; the cycle closes on the beat after the last bar
  const tabla: BandNote[] = [];
  const stroke = (b: number, s: Stroke, velocity: number) => tabla.push(note(at(b), STROKE[s], 0.3, velocity));
  for (let b = starts[1]; b < sam; b += 12) for (const [k, s, velocity] of THEKA) stroke(b + k, s, velocity);
  stroke(sam, "tin", 1);
  stroke(sam, "ge", 1);

  return [writtenPart("tanpura", tanpura), writtenPart("sarod", sarod), writtenPart("esraj", esraj), writtenPart("tabla", tabla)];
}

const METER = 3;

export const ANANDALOKE: Song = {
  id: "anandaloke",
  title: "Anandaloke Mangalaloke",
  credit: "Rabindranath Tagore, 1893, as Kangalicharan Sen notated it; harmony and band written for Orpheon",
  lang: "ipa",
  meter: METER,
  bpm: BPM,
  ...writtenTune(SONG, METER),
  voices: [
    writtenVoice(SONG, { name: "Soprano", body: "soprano" }, METER),
    writtenVoice(SONG, { name: "Alto", body: "alto" }, METER),
    writtenVoice(SONG, { name: "Tenor", body: "tenor" }, METER),
    writtenVoice(SONG, { name: "Bass", body: "bass" }, METER),
  ],
  intro: INTRO,
  band: { instruments: ["tanpura", "sarod", "esraj", "tabla"], parts: band },
  captions: writtenCaptions(SONG),
};
