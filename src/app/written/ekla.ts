// Rabindranath Tagore's "Ekla chalo re" ("Jodi tor dak shune keu na ase", 1905), in Bengali, for
// four voices and a band of tanpura, sarod, esraj and tabla. The tune is Tagore's as Indira Devi
// notated it (Swarabitan 46): dadra, six beats in two halves of three, a baul tune in the scale
// of khamaj (the seventh sharp below the tonic, flat above it), here with E as its tonic. The form
// keeps the notation's repeats and its first and second endings:
//
//   introduction  the sarod plays "ekla cholo" three times over the tanpura; the tabla comes in
//   refrain       the tenor alone ("jodi tor dak shune keu na ase, tobe ekla cholo re"); again
//                 with the bass under him
//   "ekla cholo"  the whole choir, twice
//   verse         the women ("jodi keu katha na koy, ore ore o abhaga"), high; the men, low
//                 ("jodi sobai thake mukh phiraye"); everyone from "tobe paran khule", twice
//   refrain       everyone, then "ekla cholo" twice, the last line at half the pace, held
//
// The harmony (the drone's E, the scale's own D and A chords beside the B and E of the cadence)
// and the band were written for Orpheon; no voice crosses another, no parallel fifths or octaves.
//
// Bengali is sung from IPA as anandaloke.ts sings it: the inherent vowel open ([ɔ]) unless an i
// or u follows, এ before a closed syllable as [æ], the plain stops unaspirated ("˭"), the
// aspirated ones with "ʰ" and ভ breathy ("ʱ"), all of which the IPA reader drops. No Bengali
// speaker has checked the diction yet.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, held, moved, readNotes, readSyllables, startsOf, stretched, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 160;
const METER = 3;
/** Beats the band plays before the voices: three cycles of dadra and two beats, so the first syllable ("jo") falls on the third beat, as the notation has it. */
const INTRO = 20;
/** Beats the last chord is held beyond its note. */
const FINAL = 6;

// যদি তোর ডাক শুনে কেউ না আসে তবে একলা চলো রে
const REFRAIN = readSyllables(`
  য dʑ/o/ ; দি d/i/_ ; তোর t˭/o/ɾ_ ; ডাক ɖ/a/k_ ; শু ʃ/u/ ; নে n/e/_ ; কেউ k˭/eu/_ ; না n/a/_ ; আ /a/ ; সে ʃ/e/,
  ত t˭/ɔ/ ; বে b/e/_ ; এক /æ/k ; লা l/a/_ ; চ tɕ˭/ɔ/ ; লো l/o/_ ; রে ɾ/e/,
`);
// তবে একলা চলো, একলা চলো, একলা চলো, একলা চলো রে
const EKLA = readSyllables(`
  ত t˭/ɔ/ ; বে b/e/_ ; এক /æ/k ; লা l/a/_ ; চ tɕ˭/ɔ/ ; লো l/o/_ ; এক /æ/k ; লা l/a/_ ; চ tɕ˭/ɔ/ ; লো l/o/,
  এক /æ/k ; লা l/a/_ ; চ tɕ˭/ɔ/ ; লো l/o/_ ; এক /æ/k ; লা l/a/_ ; চ tɕ˭/ɔ/ ; লো l/o/_ ; রে ɾ/e/,
`);
// যদি কেউ কথা না কয়, ওরে ওরে ও অভাগা, কেউ কথা না কয়
const NO_ONE = readSyllables(`
  য dʑ/o/ ; দি d/i/_ ; কেউ k˭/eu/_ ; ক k˭/ɔ/ ; থা tʰ/a/_ ; না n/a/_ ; কয় k˭/ɔ/j,
  ও /o/ ; রে ɾ/e/_ ; ও /o/ ; রে ɾ/e/_ ; ও /o/_ ; অ /ɔ/ ; ভা bʱ/a/ ; গা g/a/,
  কেউ k˭/eu/_ ; ক k˭/ɔ/ ; থা tʰ/a/_ ; না n/a/_ ; কয় k˭/ɔ/j,
`);
// যদি সবাই থাকে মুখ ফিরায়ে সবাই করে ভয়
const TURN_AWAY = readSyllables(`
  য dʑ/o/ ; দি d/i/_ ; স ʃ/ɔ/ ; বাই b/ai/_ ; থা tʰ/a/ ; কে k˭/e/_ ; মুখ m/u/kʰ_ ; ফি pʰ/i/ ; রা ɾ/a/ ; য়ে j/e/,
  স ʃ/ɔ/ ; বাই b/ai/_ ; ক k˭/ɔ/ ; রে ɾ/e/_ ; ভয় bʱ/ɔ/j,
`);
// তবে পরান খুলে ও তুই মুখ ফুটে তোর মনের কথা একলা বলো রে
const OPEN_HEART = readSyllables(`
  ত t˭/ɔ/ ; বে b/e/_ ; প p˭/ɔ/ ; রান ɾ/a/n_ ; খু kʰ/u/ ; লে l/e/,
  ও /o/_ ; তুই t˭/ui/_ ; মুখ m/u/kʰ_ ; ফু pʰ/u/ ; টে ʈ˭/e/_ ; তোর t˭/o/ɾ_ ; ম m/ɔ/ ; নের n/e/ɾ_ ; ক k˭/ɔ/ ; থা tʰ/a/_
  এক /æ/k ; লা l/a/_ ; ব b/ɔ/ ; লো l/o/_ ; রে ɾ/e/,
`);
const SPEAK_ALONE = OPEN_HEART.slice(6);

const REFRAIN_LINES: [string, string][] = [
  ["য·দি তোর ডাক শু·নে কেউ না আ·সে,", "If no one comes when you call,"],
  ["ত·বে এক·লা চ·লো রে", "then walk on alone."],
];
const EKLA_LINES: [string, string][] = [
  ["ত·বে এক·লা চ·লো, এক·লা চ·লো,", "Then walk alone, walk alone,"],
  ["এক·লা চ·লো, এক·লা চ·লো রে", "walk alone, walk on alone."],
];
const SPEAK_LINE: [string, string] = ["ও তুই মুখ ফু·টে তোর ম·নের ক·থা এক·লা ব·লো রে", "and say what is in your heart, alone."];
const TURN_LINES: [string, string][] = [
  ["য·দি স·বাই থা·কে মুখ ফি·রা·য়ে", "If everyone turns their face away,"],
  ["স·বাই ক·রে ভয়", "if everyone is afraid,"],
];

// ── the tune, E the tonic (sa): D#3/D#4 the sharp seventh below it, D5 the flat one above ──

/** The refrain from its upbeat ("jo-di tor"), with the notation's grace note before "na". */
const REFRAIN_TUNE = "D#4 | D#4 D#4:2 | E4:2 E4 | F#4 F#4:2 | A4:.25 ~B4:2.75 | A4:3 | G#4:.5 ~A4:.5 ~G#4:2 | F#4 E4:2 | F#4:2 G#4 | G#4 F#4 ~G#4:.5 ~F#4:.5";
/** First ending: "re", and "jo-di tor" again. Second: "re" held, "to-be" begins "ekla cholo". */
const REFRAIN_1 = `${REFRAIN_TUNE} E4:2`;
const REFRAIN_2 = `${REFRAIN_TUNE} E4:4`;
/** "ekla cholo" four times (eight bars from the first "ek"), without its upbeat and its "re". */
const EKLA_TUNE = "A4:2 B4 | B4 B4:2 | A4:.25 ~B4:1.75 B4 | B4:.25 ~D5:.75 D5 ~C#5 | B4:2 A4 | G#4 F#4:.25 ~E4:1.75 | F#4:2 G#4 | G#4 F#4 ~G#4:.5 ~F#4:.5";
/** Its first time: up from "re" into "to-be" again; its second, "re" held into the verse. */
const EKLA_1 = `A4 A4 ${EKLA_TUNE} E4 ~F#4 ~A4`;
const EKLA_2 = `A4 B4:2 ${EKLA_TUNE} E4:4`;
/** "jo-di keu katha na koy, ore ore o abhaga", and "keu katha na koy" again. */
const NO_ONE_TUNE = "A4 A4 | A4:2 B4 | B4 C#5:.5 ~D5:.5 ~C#5 | B4:4 E4 E4 | F#4 ~A4:2 | B4 ~C#5 ~D5 | C#5 ~E5 D5 | C#5 B4 ~C#5:.5 ~B4:.5 | A4:2 B4 | B4 C#5:.5 ~D5:.5 ~C#5 | B4:4";
/** "jo-di sobai thake mukh phiraye, sobai kore bhoy": high, the notation's grace notes before "sho" and "mukh". */
const TURN_HIGH = "B4 C#5 | D5:.25 ~E5:.75 E5:2 | E5 E5 ~F#5 | D5:.25 ~E5:1.75 D5 | C#5 B4 ~C#5:.5 ~B4:.5 | A4 B4:2 | B4 C#5:.5 ~D5:.5 ~C#5 | B4:4";
/** The same words again, low. */
const TURN_LOW = "E4 E4 | F#4 A4:2 | B4 C#5 ~D5 | C#5 ~E5 D5 | C#5 B4 ~C#5:.5 ~B4:.5 | A4 B4:2 | B4 C#5:.5 ~D5:.5 ~C#5 | B4:4";
/** "mukh phute tor moner katha ekla bolo re": the refrain's last line, a third higher at first. */
const SPEAK_TUNE = "A4:2 B4 | B4:.25 ~D5:.75 D5 ~C#5 | B4 A4:2 | G#4 F#4:.25 ~E4:1.75 | F#4:2 G#4 | G#4 F#4 ~G#4:.5 ~F#4:.5";
/** "tobe paran khule, o tui", then that line; the first ending holds "re" into "o tui" again. */
const OPEN_TUNE = `A4 A4 | B4 B4 ~D5 | C#5 D5:5 | C#5 B4 ~A4 ${SPEAK_TUNE} E4:4`;
/** Its second time, "re" short: "jo-di tor" and the refrain follow. */
const SPEAK_AGAIN = `A4 A4 ${SPEAK_TUNE} E4:2`;
/** The last "ekla cholo": three times as written, the fourth and its "re" at half the pace, held. */
const LAST_EKLA = `A4 B4:2 A4:2 B4 | B4 B4:2 | A4:.25 ~B4:1.75 B4 | B4:.25 ~D5:.75 D5 ~C#5 | B4:2 A4 | G#4 F#4:.25 ~E4:1.75 ${held(stretched("F#4:2 G#4 G#4 F#4 ~G#4:.5 ~F#4:.5 E4:3", 2), FINAL)}`;

// ── the harmony, by hand ──

/** The refrain in four parts (the bass also sings it under the tenor's tune). */
const REFRAIN_ALTO = "B3 B3 B3:2 | B3:2 B3 | D#4 D#4:2 | E4:3 | E4:3 | E4:3 | D#4 B3:2 | D#4:2 E4 | E4 D#4:2";
const REFRAIN_TENOR = "F#3 F#3 F#3:2 | G#3:2 G#3 | F#3 F#3:2 | G#3:3 | C#4:3 | B3:3 | B3 G#3:2 | B3:2 B3 | B3 B3:2";
const REFRAIN_BASS = "B2 B2 B2:2 | E3:2 E3 | B2 B2:2 | E3:3 | A2:3 | E3:3 | B2 E3:2 | B2:2 E3 | E3 B2:2";
/** "ekla cholo" in four parts: D (the flat seventh's chord) and E, A, B under it. */
const EKLA_ALTO = "F#4:2 G#4 G#4 G#4:2 G#4:2 G#4 F#4 F#4 ~E4 E4:2 C#4 E4 B3:2 D#4:2 E4 E4 D#4:2";
const EKLA_TENOR = "D4:2 B3 B3 B3:2 E4:2 E4 D4 D4 ~A3 G#3:2 A3 B3 G#3:2 B3:2 B3 B3 B3:2";
/** After "to-be" on A the bass goes to D; after "to-be" ending on E it stays on E (E down to D under the tune's B down to A would be parallel fifths). */
const EKLA_BASS_TAIL = "G#2 E3 E3:2 E3:2 B2 D3 D3:2 E3:2 A2 E3 E3:2 B2:2 E3 E3 B2:2";
const EKLA_BASS_1 = `D3:2 ${EKLA_BASS_TAIL}`;
const EKLA_BASS_2 = `E3:2 ${EKLA_BASS_TAIL}`;
/** The first six bars of each, for the last time. */
const firstBars = (src: string, beats: number) => {
  let t = 0;
  return src
    .split(/[\s|]+/)
    .filter(Boolean)
    .filter((token) => {
      const keep = t < beats - 1e-9;
      t += readNotes(token)[0].beats;
      return keep;
    })
    .join(" ");
};

const SONG_PARTS: { words: typeof REFRAIN; tune: string; parts: Record<string, string>; lines: [string, string][]; chords: string; sarod: number }[] = [
  // the tenor alone
  { words: REFRAIN, tune: REFRAIN_1, parts: { Tenor: moved(REFRAIN_1, -12) }, lines: REFRAIN_LINES, chords: "B:4 E:3 B:3 E:3 A:3 E:3 B:1 E:2 B:2 E:2 B:2 E:2", sarod: 0 },
  // again, the bass under him
  { words: REFRAIN, tune: REFRAIN_2, parts: { Tenor: moved(REFRAIN_2, -12), Bass: `${REFRAIN_BASS} E3:4` }, lines: REFRAIN_LINES, chords: "B:4 E:3 B:3 E:3 A:3 E:3 B:1 E:2 B:2 E:2 B:2 E:4", sarod: 1 },
  // "ekla cholo": the whole choir, twice
  {
    words: EKLA, tune: EKLA_1, lines: EKLA_LINES, sarod: 1,
    parts: { Soprano: EKLA_1, Alto: `E4 E4 ${EKLA_ALTO} B3:3`, Tenor: `C#4 C#4 ${EKLA_TENOR} G#3:3`, Bass: `A2 A2 ${EKLA_BASS_1} E3:3` },
    chords: "A:2 D:2 E:7 D:3 E:2 A:1 E:3 B:2 E:2 B:2 E:3",
  },
  {
    words: EKLA, tune: EKLA_2, lines: EKLA_LINES, sarod: 2,
    parts: { Soprano: EKLA_2, Alto: `E4 E4:2 ${EKLA_ALTO} B3:4`, Tenor: `C#4 B3:2 ${EKLA_TENOR} G#3:4`, Bass: `A2 E3:2 ${EKLA_BASS_2} E3:4` },
    chords: "A:1 E:2 D/E:2 E:7 D:3 E:2 A:1 E:3 B:2 E:2 B:2 E:4",
  },
  // the verse: the women, in thirds
  {
    words: NO_ONE, tune: NO_ONE_TUNE, sarod: 1,
    lines: [["য·দি কেউ ক·থা না কয়,", "If no one says a word to you,"], ["ও·রে ও·রে ও অ·ভা·গা,", "oh, you luckless one,"], ["কেউ ক·থা না কয়,", "if no one speaks,"]],
    parts: {
      Soprano: NO_ONE_TUNE,
      Alto: "E4 E4 F#4:2 G#4 G#4 A4:.5 ~B4:.5 ~A4 G#4:4 C#4 C#4 D4 ~F#4:2 G#4 ~A4 ~B4 A4 ~C#5 B4 A4 G#4 ~A4:.5 ~G#4:.5 F#4:2 G#4 G#4 A4:.5 ~B4:.5 ~A4 G#4:4",
    },
    chords: "A:4 E:2 A:2 E:4 E:2 D:3 E:3 A:2 E:1 A:1 E:2 A:2 E:2 A:2 E:4",
  },
  {
    words: TURN_AWAY, tune: TURN_HIGH, lines: TURN_LINES, sarod: 1,
    parts: { Soprano: TURN_HIGH, Alto: "G#4 A4 B4:.25 ~C#5:.75 C#5:2 C#5 C#5 ~D5 B4:.25 ~C#5:1.75 B4 A4 G#4 ~A4:.5 ~G#4:.5 F#4 G#4:2 G#4 A4:.5 ~B4:.5 ~A4 G#4:4" },
    chords: "E:1 A:1 E:1 A:4 D:1 E:1 A:1 E:1 A:1 E:2 D:1 E:3 A:2 E:4",
  },
  // the men, low: the tenor with the tune
  {
    words: TURN_AWAY, tune: TURN_LOW, lines: TURN_LINES, sarod: 1,
    parts: { Tenor: moved(TURN_LOW, -12), Bass: "B2 B2 D3 F#3:2 G#3 A3 ~B3 A3 ~C#4 B3 A3 G#3 ~A3:.5 ~G#3:.5 F#3 G#3:2 G#3 A3:.5 ~B3:.5 ~A3 E3:4" },
    chords: "E:2 D:3 E:1 A:1 E:1 A:2 E:1 A:1 E:2 D:1 E:3 A:2 E:4",
  },
  // everyone, from "tobe paran khule", twice
  {
    words: OPEN_HEART, tune: OPEN_TUNE, sarod: 2,
    lines: [["ত·বে প·রান খু·লে", "then open your heart"], SPEAK_LINE],
    parts: {
      Soprano: OPEN_TUNE,
      Alto: "E4 E4 E4 G#4:2 E4 F#4:5 E4 E4:2 F#4:2 G#4 F#4 F#4 ~E4 E4 C#4:2 E4 B3:2 D#4:2 E4 E4 D#4:2 B3:4",
      Tenor: "C#4 C#4 B3 B3:2 C#4 A3:5 A3 G#3:2 D4:2 B3 D4 D4 ~A3 G#3 A3:2 B3 G#3:2 B3:2 B3 B3 B3:2 G#3:4",
      Bass: "A2 A2 E3 E3:2 A2 D3:5 A2 E3:2 D3:2 G#2 D3 D3:2 E3 A2:2 E3 E3:2 B2:2 E3 E3 B2:2 E3:4",
    },
    chords: "A:2 E:3 A:1 D:5 A:1 E:2 D:2 E/G#:1 D:3 E:1 A:2 E:3 B:2 E:2 B:2 E:4",
  },
  {
    words: SPEAK_ALONE, tune: SPEAK_AGAIN, lines: [SPEAK_LINE], sarod: 2,
    parts: {
      Soprano: SPEAK_AGAIN,
      Alto: "E4 E4 F#4:2 G#4 F#4 F#4 ~E4 E4 C#4:2 E4 B3:2 D#4:2 E4 E4 D#4:2 B3:2",
      Tenor: "C#4 C#4 D4:2 B3 D4 D4 ~A3 G#3 A3:2 B3 G#3:2 B3:2 B3 B3 B3:2 G#3:2",
      Bass: "A2 A2 D3:2 G#2 D3 D3:2 E3 A2:2 E3 E3:2 B2:2 E3 E3 B2:2 E3:2",
    },
    chords: "A:2 D:2 E/G#:1 D:3 E:1 A:2 E:3 B:2 E:2 B:2 E:2",
  },
  // the refrain and "ekla cholo" once more, everyone
  {
    words: REFRAIN, tune: REFRAIN_2, lines: REFRAIN_LINES, sarod: 2,
    parts: { Soprano: REFRAIN_2, Alto: `${REFRAIN_ALTO} B3:4`, Tenor: `${REFRAIN_TENOR} G#3:4`, Bass: `${REFRAIN_BASS} E3:4` },
    chords: "B:4 E:3 B:3 E:3 A:3 E:3 B:1 E:2 B:2 E:2 B:2 E:4",
  },
  {
    words: EKLA, tune: EKLA_1, lines: EKLA_LINES, sarod: 2,
    parts: { Soprano: EKLA_1, Alto: `E4 E4 ${EKLA_ALTO} B3:3`, Tenor: `C#4 C#4 ${EKLA_TENOR} G#3:3`, Bass: `A2 A2 ${EKLA_BASS_1} E3:3` },
    chords: "A:2 D:2 E:7 D:3 E:2 A:1 E:3 B:2 E:2 B:2 E:3",
  },
  // the last time: its fourth "ekla cholo re" broadened, the chord held
  {
    words: EKLA, tune: LAST_EKLA, lines: EKLA_LINES, sarod: 2,
    parts: {
      Soprano: LAST_EKLA,
      Alto: `E4 E4:2 ${firstBars(EKLA_ALTO, 18)} ${held(stretched("D#4:2 E4 E4 D#4:2 B3:3", 2), FINAL)}`,
      Tenor: `C#4 B3:2 ${firstBars(EKLA_TENOR, 18)} ${held(stretched("B3:2 B3 B3 B3:2 G#3:3", 2), FINAL)}`,
      Bass: `A2 E3:2 ${firstBars(EKLA_BASS_2, 18)} ${held(stretched("B2:2 E3 E3 B2:2 E3:3", 2), FINAL)}`,
    },
    chords: `A:1 E:2 D/E:2 E:7 D:3 E:2 A:1 E:3 B:4 E:4 B:4 E:${6 + FINAL}`,
  },
];
const SONG: Section[] = SONG_PARTS;

// ── the band, from the chords: on each beat of the song, the chord's bass and its notes ──

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

/** Dadra's theka (dha dhin na | na tin na) with a touch of the bayan between, as strokes on the beats of a cycle. */
const THEKA: [number, Stroke, number][] = [
  [0, "ge", 0.95], [0, "na", 0.9], [1, "ge", 0.7], [1, "tin", 0.7], [2, "na", 0.75], [2.5, "ge", 0.5],
  [3, "na", 0.8], [4, "tin", 0.7], [5, "na", 0.75], [5.5, "te", 0.45],
];
type Stroke = "tin" | "na" | "te" | "ge" | "kat";
/** The tabla's stroke codes (src/band/ranges.ts): the damped "te" is its ti, the flat slap "kat" its ka. */
const STROKE: Record<Stroke, number> = { ge: 0, na: 1, tin: 2, kat: 3, te: 4 };

function band(clock: BeatClock): BandPart[] {
  const { starts, beats } = startsOf(SONG);
  const { at, beat } = clock;
  const length = (i: number) => (starts[i + 1] ?? beats) - starts[i];
  const harmony = SONG_PARTS.flatMap((b, i) => {
    const per = b.chords.split(/\s+/).filter(Boolean).flatMap((token) => {
      const [symbol, n] = token.split(":");
      return Array.from({ length: Number(n) }, () => chord(symbol));
    });
    if (per.length !== length(i)) throw new Error(`section ${i + 1}: chords for ${per.length} beats of ${length(i)}`);
    return per;
  });
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const sectionAt = (b: number) => starts.reduce((k, s, j) => (b >= s ? j : k), 0);
  /** The last chord's beat: a first beat of the tala. */
  const last = beats - FINAL - 6;
  /** A bar of three starts on song beat 1, 4, 7 ... (the song opens on the third beat). */
  const barStart = (b: number) => (((b - 1) % 3) + 3) % 3 === 0;

  // the tanpura: its four strings in turn, two beats apart, from the first sound to the last chord
  // (fifth, tonic, tonic, low tonic)
  const tanpura: BandNote[] = [];
  for (let b = -INTRO, k = 0; b <= last; b += 2, k++) tanpura.push(note(at(b), [47, 52, 52, 40][k % 4], 4, k % 4 === 3 ? 0.85 : 0.7));

  // the sarod: before the voices, "ekla cholo" three times; then a low note on each bar's first
  // beat and, as the choir fills, the chord's notes on the other beats and between them
  const sarod: BandNote[] = [];
  let t = -INTRO;
  for (const n of readNotes(firstBars(EKLA_TUNE, 18))) {
    if (n.midi) sarod.push(note(at(t), n.midi, Math.max(n.beats, 0.5) * beat, n.melisma ? 0.6 : 0.8));
    t += n.beats;
  }
  sarod.push(note(at(-2), 40, 2 * beat, 0.75));
  for (let b = 0; b < last; b++) {
    const density = SONG_PARTS[sectionAt(b)].sarod;
    const c = harmony[b];
    const tones = within(c.tones, 52, 64);
    if (barStart(b)) sarod.push(note(at(b), within([c.bass], 40, 52)[0], 2 * beat, 0.85));
    else if (density >= 1) sarod.push(note(at(b), tones[barStart(b - 1) ? 0 : tones.length - 1], 1.5 * beat, 0.6));
    if (density >= 2) sarod.push(note(at(b + 0.5), tones[1], beat, 0.5));
  }
  // the last chord, rolled upward from the low tonic
  [40, 47, 52, 56, 59, 64, 68, 71, 76].forEach((m, k) => sarod.push(note(at(last) + 0.05 * k, m, 4, 0.8)));

  // the esraj holds two notes of each chord from "ekla cholo" to the end, each moving to the
  // nearest note of the next chord
  const esraj: BandNote[] = [];
  const ranges = [[52, 64], [59, 71]];
  const now = [56, 64];
  const open: (BandNote | null)[] = [null, null];
  for (let b = starts[2]; b < beats; b++) {
    const c = harmony[b];
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

  // the tabla: dadra from the intro's second cycle, its first beat on "dak" of the refrain; soft
  // under the tenor alone and the verse's first lines, full with the whole choir; a dha on the last chord
  const tabla: BandNote[] = [];
  const quiet = (b: number) => (b < starts[2] ? 0.7 : b >= starts[4] && b < starts[7] ? 0.8 : 1);
  for (let b = -INTRO + 6; b < last; b += 6) for (const [k, s, velocity] of THEKA) tabla.push(note(at(b + k), STROKE[s], 0.3, velocity * quiet(b)));
  tabla.push(note(at(last), STROKE.ge, 0.3, 1), note(at(last), STROKE.na, 0.3, 1));

  return [writtenPart("tanpura", tanpura), writtenPart("sarod", sarod), writtenPart("esraj", esraj), writtenPart("tabla", tabla)];
}

export const EKLA_CHALO: Song = {
  id: "ekla",
  title: "Ekla chalo re",
  credit: "Rabindranath Tagore, 1905, as Indira Devi notated it (Swarabitan 46); harmony and band written for Orpheon",
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
