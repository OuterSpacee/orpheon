// "Lamma bada yatathanna": a muwashshah of al-Andalus, its words thought to be Ibn al-Khatib's
// (1313-1374), its tune traditional, in maqam nahawand (G minor with the raised seventh) and the
// ten-beat samai: here 10/8, an eighth to a beat. The tune is the public-domain transcription on
// Wikimedia Commons (File:Lamma_bada_yatathanna.jpg), note for note: the refrain (A) is sung twice,
// then the verse (B), then the refrain once more (da capo, to the Fine).
//
// Sung as a muwashshah is sung, not harmonised: one line of melody, the men an octave under the
// women, over drones (the tanpura, and voices holding the tonic and the fifth on the words).
//
//   introduction  tanpura and tabla in the samai, the sarod with the refrain's opening
//   refrain       the soprano alone
//   refrain       again, the alto holding D and the bass G under her; the sarod with the tune
//   verse         the tenor alone ("wa'di wa ya hirati"); the women and the bass's drone answer
//                 from "illa malikul jamal"; the esraj with the tune
//   interlude     the sarod plays the verse's first line
//   refrain       everyone, the men an octave under; the last note held
//
// Arabic is sung from IPA: ح and ع have no form in the voice and become h; ظ is sung as ð, its
// emphasis dropped. No Arabic speaker has checked the diction yet.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, moved, readNotes, readSyllables, startsOf, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

/** Eighths a minute. */
const BPM = 168;
const METER = 10;
/** Eighths before the first pickup: two bars of the samai less the pickup's eighth. */
const INTRO = 19;
/** Eighths the last note is held beyond its bar. */
const FINAL = 8;
/** The band's interlude before the last refrain, in eighths: two bars. */
const INTERLUDE = 20;

// ── the tune, as the transcription writes it (G minor: B flat and E flat; F sharp marked) ──
// Each section opens on an eighth's pickup; its bars start on its beats 1, 11, 21 ...
const A =
  "D4 | G4:2 A4:.5 ~Bb4:.5 C5:.5 ~Bb4:.5 ~Bb4:.5 ~A4:.5 A4:.5 G4:.5 G4:.5 ~F#4:.5 G4:2 D4 " +
  "| G4:2 A4:.5 ~Bb4:.5 C5:.5 ~Bb4:.5 ~Bb4:.5 ~A4:.5 A4:.5 G4:.5 G4:.5 ~F#4:.5 G4:2 A4:.5 ~Bb4:.5 " +
  "| C5:2 D5 Bb4:1.5 ~A4:.5 A4:.5 G4:.5 G4:.5 ~F#4:.5 G4:2 A4 " +
  "| F#5:2 G5 Eb5:1.5 D5:.5 Eb5:.5 D5:.5 Eb5:.5 F#5:.5 D5:2 Eb5:.5 ~D5:.5 " +
  "| C5:2 D5:.5 ~C5:.5 Bb4:1.5 A4:.5 A4:.5 ~G4:.5 ~G4:.5 F#4:.5 G4:2";
const B =
  "D4 | G4:2 A4:.5 ~Bb4:.5 C5:.5 ~Bb4:.5 ~Bb4:.5 ~A4:.5 A4:.5 ~G4:.5 F#4:.5 ~A4:.5 G4:2 D4 " +
  "| G4:2 A4:.5 ~Bb4:.5 C5:.5 ~Bb4:.5 ~Bb4:.5 ~A4:.5 A4:.5 ~G4:.5 F#4:.5 ~A4:.5 G4:2 Bb4 " +
  "| Bb4:2 Bb4 Bb4:2 Bb4 A4:.5 ~C5:.5 Bb4:2 Bb4:.5 ~C5:.5 " +
  "| D5:2 C5 D5:.5 ~C5:.5 ~Bb4:.5 ~A4:.5 Bb4:.5 ~A4:.5 ~G4:.5 Bb4:.5 A4:2 F4 " +
  "| G4:2 G4:.5 ~A4:.5 Bb4:2 Bb4:.5 ~C5:.5 A4:.5 ~C5:.5 Bb4:2 A4:.5 ~Bb4:.5 " +
  "| C5:1.5 ~Bb4:.5 C5:.5 ~D5:.5 D5:.5 ~Bb4:.5 ~Bb4:.5 ~A4:.5 A4:.5 ~G4:.5 ~G4:.5 F#4:.5 G4:2 A4:.5 ~G4:.5 " +
  "| F#4:2 G4 F#4:.5 ~Eb4 ~D4:.5 Eb4:.5 ~D4:.5 ~Eb4:.5 F#4:.5 D4:2 Eb5:.5 ~D5:.5 " +
  "| C5:2 D5 Bb4:1.5 ~A4:.5 A4:.5 ~G4:.5 ~G4:.5 F#4:.5 G4:2";
/** The last refrain: two bars for the band first, the last note held. */
const A_LAST = `R:${INTERLUDE} ${A.replace(/G4:2$/, `G4:${2 + FINAL}`)}`;

/** Every note of `src` on one pitch, lengths and "~" kept: a voice holding a drone on the words. */
const drone = (src: string, pitch: string) =>
  src
    .split(/\s+/)
    .filter((t) => t && t !== "|")
    .map((t) => (t.startsWith("R") ? t : t.replace(/^(~?)[A-G][#b]?\d/, `$1${pitch}`)))
    .join(" ");

/** `src` sounding only from beat `from` to beat `to`, silent elsewhere: a voice coming in or stepping out at a syllable. */
function only(src: string, from: number, to = Infinity): string {
  return keep(src, (t) => t >= from - 1e-9 && t < to - 1e-9);
}

/** `src` silent from beat `from` to beat `to`. */
const silent = (src: string, from: number, to: number) => keep(src, (t) => t < from - 1e-9 || t >= to - 1e-9);

function keep(src: string, sounding: (t: number) => boolean): string {
  const out: string[] = [];
  let t = 0;
  let rest = 0;
  const flush = () => {
    if (rest > 1e-9) out.push(`R:${rest}`);
    rest = 0;
  };
  for (const token of src.split(/\s+/).filter((x) => x && x !== "|")) {
    const n = readNotes(token)[0];
    const inside = sounding(t);
    if (!inside) rest += n.beats;
    else {
      if (n.melisma && rest > 1e-9) throw new Error(`a melisma at beat ${t} after a rest`);
      flush();
      out.push(token);
    }
    t += n.beats;
  }
  flush();
  return out.join(" ");
}

// ── the words, in IPA, syllable by syllable as the tune takes them ──
const LAMMA = `lam l/a/m ; ma m/aː/ ; ba b/a/ ; da d/aː/_ ; ya j/a/ ; ta t/a/ ; than θ/a/n ; na n/aː/,`;
const A_WORDS = readSyllables(`
  ${LAMMA}
  ${LAMMA}
  hub ħ/u/b ; bi b/iː/_ ; ja dʒ/a/ ; maa m/aː/ ; luh l/u/h_ ; fa f/a/ ; tan t/a/n ; na n/aː/,
  am ʔ/a/m ; run r/u/n_ ; ma m/aː/_ ; bi b/i/ ; lah l/a/ħ ; za ð/a/ ; tin t/i/n_ ; a ʔ/a/ ; sar s/a/r ; na n/aː/,
  ghus ɣ/u/s ; nun n/u/n_ ; tha θ/a/ ; na n/aː/_ ; hi ħ/iː/ ; na n/a/_ ; ma m/aː/ ; la l/aː/,
`);
const WAADI = `wa w/a/ʕ ; di d/iː/_ ; wa w/a/ ; ya j/aː/_ ; hay ħ/a/j ; ra r/a/ ; ti t/iː/,`;
const FIL = `fil f/i/l ; hub ħ/u/b ; bi b/i/_ ; min m/i/n_ ; law l/a/w ; a ʕ/a/ ; ti t/iː/,`;
const ILLA = `il ʔ/i/l ; la l/aː/_ ; ma m/a/ ; li l/iː/ ; kul k/u/l_ ; ja dʒ/a/ ; mal m/aː/l,`;
const B_WORDS = readSyllables(`
  ${WAADI}
  ${WAADI}
  man m/a/n_ ; li l/iː/_ ; ra r/a/ ; him ħ/iː/m_ ; shak ʃ/a/k ; wa w/a/ ; ti t/iː/,
  ${FIL}
  ${ILLA}
  ${ILLA}
  ${FIL}
  ${ILLA}
`);

// Captions: whole words lit as their first syllable is sung (a word's later syllables are the
// empty pieces after its "·"; Arabic letters joined across a piece would lose their shapes).
const A_LINES: [string, string][] = [
  ["لمّا· بدا· يتثنّى···", "when my love appeared, swaying"],
  ["لمّا· بدا· يتثنّى···", "when my love appeared, swaying"],
  ["حبّي· جمالُه·· فتنّا··", "my love's beauty held me spellbound"],
  ["أمرٌ· ما بلحظةٍ··· أسرنا··", "something in one glance made us captive"],
  ["غصنٌ· ثنى· حين· مال·", "a branch that bent as it swayed"],
];
const WAADI_LINE: [string, string] = ["وعدي· ويا· حيرتي··", "my fate, and oh, my bewilderment"];
const FIL_LINE: [string, string] = ["في الحبّ· من لوعتي··", "in love, for the burning in me"];
const ILLA_LINE: [string, string] = ["إلّا· مليكُ·· الجمال·", "but the king of beauty"];
const B_LINES: [string, string][] = [WAADI_LINE, WAADI_LINE, ["من لي رحيمٌ· شكوتي··", "who will take pity on my complaint"], FIL_LINE, ILLA_LINE, ILLA_LINE, FIL_LINE, ILLA_LINE];

/** Where the verse's women and drone come in: the pickup of "illa malikul jamal" (its fifth line). */
const ANSWER = 40;
/** The refrain's fourth bar, high ("amrun ma bilahzatin"), past the alto's top: she rests through it. */
const HIGH_BAR: [number, number] = [31, 41];

const SONG: Section[] = [
  { words: A_WORDS, tune: A, parts: { Soprano: A }, lines: A_LINES },
  { words: A_WORDS, tune: A, parts: { Soprano: A, Alto: drone(A, "D4"), Bass: drone(A, "G2") }, lines: A_LINES },
  { words: B_WORDS, tune: B, parts: { Tenor: moved(B, -12), Soprano: only(B, ANSWER), Bass: only(drone(B, "G2"), ANSWER) }, lines: B_LINES },
  {
    words: A_WORDS,
    tune: A_LAST,
    parts: {
      Soprano: A_LAST,
      Alto: silent(A_LAST, INTERLUDE + HIGH_BAR[0], INTERLUDE + HIGH_BAR[1]),
      Tenor: moved(A_LAST, -12),
      Bass: drone(A_LAST, "G2"),
    },
    lines: A_LINES,
  },
];

// ── the band ──

type Stroke = "ge" | "na" | "tin" | "kat" | "te";
/** The tabla's stroke codes (src/band/ranges.ts). */
const STROKE: Record<Stroke, number> = { ge: 0, na: 1, tin: 2, kat: 3, te: 4 };
/**
 * The samai thaqil on the tabla, its ten eighths: dum . . tak . dum dum tak . . (the deep "ge" for
 * dum, the ringing "na" for tak), and light "te" strokes in the gaps.
 */
const SAMAI: [number, Stroke, number][] = [
  [0, "ge", 0.95], [0, "na", 0.5], [2, "te", 0.3], [3, "na", 0.8], [4, "te", 0.3],
  [5, "ge", 0.85], [6, "ge", 0.8], [7, "na", 0.75], [8.5, "te", 0.3], [9, "te", 0.35],
];

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t: at(t), d: d * beat, midi, velocity });
  const tanpura: BandNote[] = [];
  const tabla: BandNote[] = [];
  const sarod: BandNote[] = [];
  const esraj: BandNote[] = [];
  const [, refrain2, verse, last] = starts;
  const end = beats - FINAL;

  // the tanpura: its four strings in turn (the fifth, the tonic twice, the low tonic), four to a bar
  for (let b = -INTRO; b < beats - 1e-9; b += 2.5) {
    const k = Math.round((b + INTRO) / 2.5) % 4;
    tanpura.push(note(b, [50, 55, 55, 43][k], 6, k === 3 ? 0.85 : 0.7));
  }

  // the tabla: the samai from the first bar to the held last note, softer under the soprano alone
  for (let bar = 1 - 2 * METER; bar < end - 1e-9; bar += METER) {
    const soft = bar < refrain2 ? 0.7 : bar >= last && bar < last + INTERLUDE ? 0.85 : 1;
    for (const [k, s, v] of SAMAI) if (bar + k < end - 1e-9) tabla.push(note(bar + k, STROKE[s], 0.3, v * soft));
  }
  tabla.push(note(end, STROKE.ge, 0.5, 1));
  tabla.push(note(end, STROKE.tin, 0.5, 0.8));

  /** A stretch of the tune played on an instrument from song beat `t0`: its notes from tune beat `from` to `to`, moved `shift` semitones. */
  const play = (out: BandNote[], tune: string, t0: number, from: number, to: number, shift: number, velocity: number) => {
    let t = 0;
    for (const n of readNotes(tune)) {
      if (n.midi && t >= from - 1e-9 && t < to - 1e-9) out.push(note(t0 + t - from, n.midi + shift, n.beats * 0.95, n.melisma ? velocity * 0.8 : velocity));
      t += n.beats;
    }
  };
  // the sarod: the refrain's first two bars before the voices; the tune with the second refrain,
  // an octave under it; the verse's first line alone before the last refrain; the tune again there
  play(sarod, A, -INTRO, 1, 1 + INTRO, 0, 0.75);
  play(sarod, A, refrain2, 0, 50, -12, 0.5);
  play(sarod, B, last, 1, 1 + INTERLUDE, 0, 0.75);
  play(sarod, A_LAST, last, INTERLUDE, beats - last, -12, 0.55);
  // the esraj: the tune with the tenor's verse, softly, and over the last refrain
  play(esraj, B, verse, 0, 80, 0, 0.45);
  play(esraj, A_LAST, last, INTERLUDE, beats - last, 0, 0.4);
  // the last note: the sarod's low tonic and the chord of the drone rolled up
  [43, 50, 55, 62, 67].forEach((m, k) => sarod.push(note(end + 0.15 * k, m, FINAL, 0.75)));

  return [writtenPart("tanpura", tanpura), writtenPart("tabla", tabla), writtenPart("sarod", sarod), writtenPart("esraj", esraj)];
}

export const LAMMA_BADA: Song = {
  id: "lamma",
  title: "Lamma bada yatathanna",
  credit: "Muwashshah of al-Andalus, words thought to be Ibn al-Khatib’s (1313–1374), tune traditional; arrangement written for Orpheon",
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
  band: { instruments: ["tanpura", "tabla", "sarod", "esraj"], parts: band },
  captions: writtenCaptions(SONG),
};
