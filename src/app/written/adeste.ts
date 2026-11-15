// "Adeste fideles": John Francis Wade's hymn (about 1743), in Latin and then in Frederick
// Oakeley's English (1841), for four voices with strings, harp, a double bass and timpani.
// Written for Orpheon, as a choir would stage it:
//
//   introduction  the strings play the refrain's last phrase, the harp under them
//   verse 1       Latin: the sopranos alone; the altos join them at "venite"; the men at "Natum
//                 videte". The refrain builds as it is meant to: the women sing the first
//                 "venite adoremus", the men the second (the tenor with the tune), everyone the third
//   bridge        a bar for the band alone on E seven: the next verse is a tone higher
//   verse 2       English, in A: everyone, the band full, the timpani at the cadences
//   ending        "O come, let us adore him, Christ the Lord" once more, broadened, held
//
// The harmony is written for this arrangement in the hymn's own manner (a secondary dominant
// into "Bethlehem", a bass falling by step G E D C B A G under the last "venite adoremus"),
// voiced by hand: no voice crosses another, no parallel fifths or octaves. The words are sung from
// IPA, the Latin in its church pronunciation. All of it is in the public domain.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Chord, type Section, chordsOf, held, moved, readNotes, readSyllables, startsOf, stretched, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 96;
const METER = 4;
/** Beats of the strings' introduction before the first pickup ("A-"). */
const INTRO = 15;
/** Beats the last chord is held beyond its note, and how much the ending broadens. */
const FINAL = 3;
const BROADEN = 1.5;
/** The English verse a tone higher. */
const LIFT = 2;

// ── a verse in G, part by part, in its six stretches (16, 17, 15, 8, 8 and 16 beats) ──
//   L1 "Adeste fideles laeti triumphantes"   L2 "venite venite in Bethlehem" (and a rest)
//   L3 "Natum videte regem angelorum"        R1 R2 R3 the three "venite adoremus" (R3 with "Dominum")
const S = {
  L1: "G4 | G4:2 D4 G4 | A4:2 D4:2 | B4 A4 B4 C5 | B4:2 A4",
  L2: "G4 | G4:2 F#4 E4 | F#4 ~G4 A4 B4 | F#4:2 ~E4:1.5 D4:.5 | D4:3 R",
  L3: "D5:2 C5 B4 | C5:2 B4:2 | A4 B4 G4 A4 | F#4:1.5 ~E4:.5 D4",
  R1: "G4 | G4 F#4 G4 A4 | G4:2 D4",
  R2: "B4 | B4 A4 B4 C5 | B4:2 A4",
  R3: "B4 | C5 B4 A4 G4 | F#4:2 G4 C5 | ~B4:2 A4:1.5 ~G4:.5 | G4:3",
};
const A = {
  L1: "D4 | D4:2 A3 D4 | D4:2 A3:2 | D4 D4 D4 E4 | D4:2 F#4",
  L2: "D4 | E4:2 D4 C4 | D4:2 E4 D4 | D4:2 ~C#4:1.5 C#4:.5 | D4:3 R",
  L3: "G4:2 E4 E4 | E4:2 D4:2 | D4 D4 E4 F#4 | D4:1.5 ~C#4:.5 D4",
  // with the sopranos alone, and in four parts: thirds and sixths under the tune
  R1: "D4 | E4 D4 E4 F#4 | B3:2 A3",
  R2: "D4 | D4 D4 D4 E4 | D4:2 F#4",
  R3: "G4 | G4 G4 F#4 D4 | D4:2 D4 E4 | ~D4:2 F#4:2 | D4:3",
};
const T = {
  L1: "B3 | G3:2 F#3 B3 | A3:2 F#3:2 | G3 A3 G3 G3 | G3:2 C4",
  L2: "B3 | B3:2 A3 A3 | A3:2 A3 F#3 | A3:2 ~G3:1.5 G3:.5 | F#3:3 R",
  L3: "D4:2 A3 B3 | G3:2 G3:2 | A3 G3 B3 C4 | A3:2 F#3",
  R1: "B3 | G3 A3 B3 A3 | B3:2 F#3",
  R2: "G3 | G3 F#3 G3 G3 | G3:2 C4",
  R3: "B3 | E4 B3 D4 G3 | A3:2 G3 G3 | ~G3:2 C4:2 | B3:3",
};
const B = {
  L1: "G2 | G2:2 D3 G2 | F#2:2 D3:2 | G2 F#2 G2 C3 | D3:2 D3",
  L2: "G2 | E2:2 D3 A2 | D3:2 C#3 B2 | A2:3.5 A2:.5 | D3:3 R",
  L3: "G2:2 A2 G2 | C3:2 G2:2 | F#2 G2 E2 D3 | A2:2 D3",
  R1: "G2 | B2 D3 G2 F#2 | G2:2 D3",
  R2: "G2 | B2 D3 G2 C3 | D3:2 D3",
  R3: "G3 | E3 D3 C3 B2 | A2:2 B2 C3 | ~D3:2 D3:2 | G2:3",
};
type Part = typeof S;
const whole = (p: Part) => `${p.L1} ${p.L2} ${p.L3} ${p.R1} ${p.R2} ${p.R3}`;
/** The men's "venite adoremus": the tenor with the tune, an octave under the sopranos'. */
const MEN_R2 = moved(S.R2, -12);
/** The broadened ending: the last refrain line, slower, its last chord held. */
const ending = (src: string) => moved(held(stretched(src, BROADEN), FINAL), LIFT);
const up = (src: string) => moved(src, LIFT);

// Latin in its church pronunciation; the stressed syllable of each word marked.
const LATIN = readSyllables(`
  A /a/ ; des ˈd/e/s ; te t/e/_ ; fi f/i/ ; de ˈd/e/ ; les l/e/s,
  lae ˈl/ɛ/ ; ti t/i/_ ; tri t ɾ/i/ ; um /u/m ; phan ˈf/a/n ; tes t/e/s,
  ve v/e/ ; ni ˈn/i/ ; te t/e/_ ; ve v/e/ ; ni ˈn/i/ ; te t/e/_ ; in /i/n_ ; Beth ˈb/e/t ; le l/e/ ; hem /e/m,
  Na ˈn/a/ ; tum t/u/m_ ; vi v/i/ ; de ˈd/e/ ; te t/e/_ ; re ˈɾ/e/ ; gem dʒ/e/m_ ; an /a/n ; ge dʒ/e/ ; lo ˈl/o/ ; rum ɾ/u/m,
  ve v/e/ ; ni ˈn/i/ ; te t/e/_ ; a /a/ ; do d/o/ ; re ˈɾ/e/ ; mus m/u/s,
  ve v/e/ ; ni ˈn/i/ ; te t/e/_ ; a /a/ ; do d/o/ ; re ˈɾ/e/ ; mus m/u/s,
  ve v/e/ ; ni ˈn/i/ ; te t/e/_ ; a /a/ ; do d/o/ ; re ˈɾ/e/ ; mus m/u/s_
  Do ˈd/o/ ; mi m/i/ ; num n/u/m,
`);
const ADORE = "O /oʊ/_ ; come ˈk/ʌ/m_ ; let l/ɛ/t_ ; us /ʌ/s_ ; a /ə/ ; dore ˈd/ɔ/ɹ ; him h/ɪ/m";
const ENGLISH = readSyllables(`
  O /oʊ/_ ; come ˈk/ʌ/m_ ; all /ɔ/l_ ; ye j/i/_ ; faith ˈf/eɪ/θ ; ful f/ʊ/l,
  joy ˈdʒ/ɔɪ/ ; ful f/ʊ/l_ ; and /æ/n d_ ; tri t ɹ/aɪ/ ; um ˈ/ʌ/m ; phant f/ə/n t,
  O /oʊ/_ ; come ˈk/ʌ/m_ ; ye j/i/_ ; O /oʊ/_ ; come ˈk/ʌ/m_ ; ye j/i/_ ; to t/u/_ ; Beth ˈb/ɛ/θ ; le l/ə/ ; hem h/ɛ/m,
  come ˈk/ʌ/m_ ; and /æ/n d_ ; be b/ɪ/ ; hold ˈh/oʊ/l d_ ; him h/ɪ/m, ; born ˈb/ɔ/ɹ n_ ; the ð/ə/_ ; King ˈk/ɪ/ŋ_ ; of /ʌ/v_ ; an ˈ/eɪ/n ; gels dʒ/ə/l z,
  ${ADORE}, ; ${ADORE}, ; ${ADORE}_ ; Christ ˈk ɹ/aɪ/s t_ ; the ð/ə/_ ; Lord ˈl/ɔ/ɹ d,
`);
const ENDING_WORDS = readSyllables(`${ADORE}_ ; Christ ˈk ɹ/aɪ/s t_ ; the ð/ə/_ ; Lord ˈl/ɔ/ɹ d,`);

const LATIN_LINES: [string, string][] = [
  ["A·des·te fi·de·les,", "O come, all ye faithful,"],
  ["lae·ti tri·um·phan·tes,", "joyful and triumphant,"],
  ["ve·ni·te, ve·ni·te in Beth·le·hem.", "O come ye, O come ye to Bethlehem."],
  ["Na·tum vi·de·te", "Come and behold him,"],
  ["Re·gem an·ge·lo·rum.", "born the King of angels."],
  ["Ve·ni·te, a·do·re·mus,", "O come, let us adore him,"],
  ["ve·ni·te, a·do·re·mus,", "O come, let us adore him,"],
  ["ve·ni·te, a·do·re·mus Do·mi·num.", "O come, let us adore him, Christ the Lord."],
];
const ENGLISH_LINES: [string, string][] = [
  ["O come, all ye faith·ful,", ""],
  ["joy·ful and tri·um·phant!", ""],
  ["O come ye, O come ye to Beth·le·hem;", ""],
  ["come and be·hold him,", ""],
  ["born the King of an·gels:", ""],
  ["O come, let us a·dore him,", ""],
  ["O come, let us a·dore him,", ""],
  ["O come, let us a·dore him, Christ the Lord.", ""],
];

const SONG: Section[] = [
  {
    words: LATIN,
    tune: whole(S),
    parts: {
      Soprano: `${S.L1} ${S.L2} ${S.L3} ${S.R1} R:8 ${S.R3}`,
      Alto: `R:16 ${A.L2} ${A.L3} ${A.R1} R:8 ${A.R3}`,
      Tenor: `R:33 ${T.L3} R:8 ${MEN_R2} ${T.R3}`,
      Bass: `R:33 ${B.L3} R:8 ${B.R2} ${B.R3}`,
    },
    lines: LATIN_LINES,
  },
  {
    words: ENGLISH,
    tune: `R:4 ${up(whole(S))}`,
    parts: { Soprano: `R:4 ${up(whole(S))}`, Alto: `R:4 ${up(whole(A))}`, Tenor: `R:4 ${up(whole(T))}`, Bass: `R:4 ${up(whole(B))}` },
    lines: ENGLISH_LINES,
  },
  {
    words: ENDING_WORDS,
    tune: ending(S.R3),
    parts: { Soprano: ending(S.R3), Alto: ending(A.R3), Tenor: ending(T.R3), Bass: ending(B.R3) },
    lines: [["O come, let us a·dore him, Christ the Lord.", ""]],
  },
];

// ── the band, from the written harmony ──

/** The harmony of the refrain's last phrase without its first syllable: the introduction's. */
const tail = (src: string) => src.replace(/^\S+\s*\|?\s*/, "");

function harmony(starts: number[]): Chord[] {
  const four = (f: (p: Part) => string) => [f(B), f(T), f(A), f(S)];
  return [
    ...chordsOf(four((p) => tail(p.R3)), -INTRO),
    ...chordsOf(four(whole), starts[0]),
    ...chordsOf(four((p) => `R:4 ${up(whole(p))}`), starts[1]),
    ...chordsOf(four((p) => ending(p.R3)), starts[2]),
  ].filter((c) => c.notes.every((m) => m > 0));
}

/** A chord's upper notes placed for the harp's middle hand (D4 up to C#5), lowest first. */
const middle = (c: Chord) => [...new Set(c.notes.slice(1).map((m) => 62 + ((((m - 62) % 12) + 12) % 12)))].sort((a, b) => a - b);

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const chords = harmony(starts);
  const chordAt = (b: number) => chords.find((c) => b >= c.t - 1e-9 && b < c.t + c.d - 1e-9) ?? null;
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const strings: BandNote[] = [];
  const harp: BandNote[] = [];
  const bass: BandNote[] = [];
  const timpani: BandNote[] = [];
  const bridge = starts[1];
  const last = beats - FINAL;
  /** Where each stretch of verse 1 starts: the altos at 16, the men at 33, the refrain at 48, 56 and 64. */
  const v1 = (from: number) => starts[0] + from;

  // the introduction: the strings sing the refrain's last phrase over its harmony, the harp rolling each chord
  let t = -INTRO;
  for (const n of readNotes(tail(S.R3))) {
    if (n.midi && !n.melisma) strings.push(note(at(t), n.midi + 12, n.beats * beat, 0.62));
    else if (n.midi) strings.push(note(at(t), n.midi + 12, n.beats * beat, 0.55));
    t += n.beats;
  }
  for (const c of chords.filter((c) => c.t < 0)) {
    [c.notes[0], ...middle(c)].forEach((m, k) => harp.push(note(at(c.t) + 0.05 * k, m, 2.4, 0.45)));
    [c.notes[1], c.notes[2]].forEach((m) => strings.push(note(at(c.t), m, c.d * beat, 0.45)));
  }

  // the bridge into A: E seven alone for a bar, rolled, the timpani swelling under it
  [52, 56, 59, 62].forEach((m) => strings.push(note(at(bridge), m, 4 * beat + 0.05, 0.62)));
  [40, 52, 56, 59, 62, 64, 68, 71].forEach((m, k) => harp.push(note(at(bridge) + 0.06 * k, m, 3.5, 0.5)));
  bass.push(note(at(bridge), 40, beat * 3.5, 0.8));
  for (let q = 0; q < 16; q++) timpani.push(note(at(bridge + q / 4), 52, 0.3, 0.2 + 0.035 * q));

  for (let b = 0; b < last; b++) {
    if (b >= bridge && b < bridge + 4) continue;
    const c = chordAt(b);
    if (!c) continue;
    const english = b >= starts[1];
    const tones = middle(c);
    // the harp from the altos' entry: quarter notes up and down the chord; in English, eighths
    if (english || b >= v1(16)) {
      const k = (((b - 1) % 4) + 4) % 4;
      const pattern = [c.notes[0], tones[0], tones[1] ?? tones[0], tones[2] ?? tones[1] ?? tones[0]];
      harp.push(note(at(b), pattern[k], 2, k === 0 ? 0.5 : 0.36));
      if (english) {
        const half = chordAt(b + 0.5) ?? c;
        const ht = middle(half);
        harp.push(note(at(b + 0.5), (ht[(k + 1) % ht.length] ?? ht[0]) + 12, 1.6, 0.3));
      }
    }
    // the double bass from the men's entry, on the bar's first and third beats
    const k = (((b - 1) % 4) + 4) % 4;
    if ((english || b >= v1(33)) && (k === 0 || k === 2)) bass.push(note(at(b), c.notes[0] - 12, beat * 1.7, english ? 0.85 : 0.7));
    // the timpani: the third "venite adoremus" of each verse, and every cadence in English
    const refrain3 = english ? starts[1] + 4 + 64 : v1(64);
    if (b >= refrain3 && k === 0) timpani.push(note(at(b), pitchForTimpani(c.notes[0]), 1, 0.6));
    if (english && k === 0 && b < refrain3 && (b - starts[1] - 4) % 16 === 13) timpani.push(note(at(b), pitchForTimpani(c.notes[0]), 1, 0.5));
  }

  // the strings hold the three lower parts from the men's entry to the end, moving as they move
  for (let v = 0; v < 3; v++) {
    let open: BandNote | null = null;
    for (const c of chords.filter((c) => c.t >= v1(33))) {
      const m = c.notes[v] + (v === 0 ? 12 : 0);
      if (open && open.midi === m) continue;
      if (open) open.d = at(c.t) - open.t;
      open = note(at(c.t), m, 0, c.t >= starts[1] ? 0.72 : 0.58);
      strings.push(open);
    }
    if (open) open.d = at(beats) - open.t;
  }
  // (what the strings held of the Latin verse stops where the bridge begins)
  for (const n of strings) if (n.t < at(bridge) - 1e-6 && n.t + n.d > at(bridge) + 1e-6) n.d = at(bridge) - n.t;

  // the ending: the last chord rolled up through four octaves, the bass on its root, the timpani rolling
  const finalChord = chordAt(last) ?? chords[chords.length - 1];
  const root = finalChord.notes[0];
  [root, root + 12, ...middle(finalChord), ...middle(finalChord).map((m) => m + 12), middle(finalChord)[0] + 24].forEach((m, k) => harp.push(note(at(last) + 0.06 * k, m, 5, 0.55)));
  bass.push(note(at(last), root - 12, beat * FINAL, 0.9));
  for (let q = 0; q < FINAL * 4; q++) timpani.push(note(at(last + q / 4), pitchForTimpani(root), 0.3, 0.75 * (q < 2 ? 1 : 0.4 + 0.5 * Math.sin((Math.PI * q) / (FINAL * 4)))));

  return [writtenPart("strings", strings), writtenPart("harp", harp), writtenPart("bass", bass), writtenPart("timpani", timpani)];
}

/** The timpani's drum for a bass note: its pitch moved by octaves into D2..A3. */
function pitchForTimpani(midi: number): number {
  let m = midi;
  while (m < 38) m += 12;
  while (m > 57) m -= 12;
  return m;
}

export const ADESTE: Song = {
  id: "adeste",
  title: "Adeste fideles",
  credit: "John Francis Wade, about 1743; English words by Frederick Oakeley, 1841; arrangement written for Orpheon",
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
  band: { instruments: ["strings", "harp", "bass", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
