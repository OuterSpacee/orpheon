// The theme of Beethoven's "Ode an die Freude" (Symphony No. 9, 1824) on Schiller's first stanza,
// in German, for four voices and a band of harp, bass, strings and timpani. The form, as the
// symphony builds the theme: the voices come in one by one, each with the tune (the bass alone,
// then the tenor, then the alto, and the soprano completes the choir on "Alle Menschen werden
// Brüder"); then the whole stanza in four parts, and its second half once more, the last chord
// held. The harmony and the band were written for Orpheon.
//
// German is sung from IPA, in sung diction: a flipped r, and -er as [ɐ] (the IPA reader sings it
// as ə). The stressed syllable of each word of two or more is marked, so its consonants get a
// stressed syllable's breath.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, readNotes, readSyllables, startsOf, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 108;
/** Beats the band plays before the voices come in. */
const INTRO = 8;
/** The last chord's length in beats. */
const FINAL = 4;

const WORDS = readSyllables(`
  Freu ˈf ɾ/ɔɪ/ ; de d/ə/_ ; schö ˈʃ/ø/ ; ner n/ɐ/_
  Göt ˈg/œ/ ; ter t/ɐ/ ; fun ˌf/ʊ/ŋ ; ken k/ə/n,
  Toch ˈt/ɔ/x ; ter t/ɐ/_ ; aus /aʊ/s_ ; E /e/
  ly ˈl/y/ ; si z/i/ ; um /ʊ/m,
  Wir v/i/ɾ_ ; be b/ə/ ; tre ˈt ɾ/e/ ; ten t/ə/n_
  feu ˈf/ɔɪ/ ; er /ɐ/ ; trun ˌt ɾ/ʊ/ŋ ; ken k/ə/n,
  Himm ˈh/ɪ/m ; li l/ɪ/ ; sche ʃ/ə/_ ; dein d/aɪ/n_
  Hei ˈh/aɪ/ ; lig l/ɪ/ç ; tum ˌt/u/m,
  Dei ˈd/aɪ/ ; ne n/ə/_ ; Zau ˈts/aʊ/ ; ber b/ɐ/_
  bin ˈb/ɪ/n ; den d/ə/n_ ; wie ˈv/i/ ; der d/ɐ/,
  was v/a/s_ ; die d/i/_ ; Mo ˈm/o/ ; de d/ə/_
  streng ʃ t ɾ/ɛ/ŋ_ ; ge g/ə/ ; teilt ˈt/aɪ/l t, ; Al ˈ/a/
  le l/ə/_ ; Men ˈm/ɛ/n ; schen ʃ/ə/n_
  wer ˈv/e/ɾ ; den d/ə/n_ ; Brü ˈb ɾ/y/ ; der d/ɐ/,
  wo v/o/_ ; dein d/aɪ/n_ ; sanf ˈz/a/n f ; ter t/ɐ/_
  Flü ˈf l/y/ ; gel g/ə/l_ ; weilt v/aɪ/l t,
`);

const LINES: [string, string][] = [
  ["Freu·de, schö·ner Göt·ter·fun·ken,", "Joy, bright spark of the gods,"],
  ["Toch·ter aus E·ly·si·um,", "daughter of Elysium,"],
  ["wir be·tre·ten feu·er·trun·ken,", "drunk with fire, we enter"],
  ["Himm·li·sche, dein Hei·lig·tum!", "your sanctuary, heavenly one!"],
  ["Dei·ne Zau·ber bin·den wie·der,", "Your magic binds together again"],
  ["was die Mo·de streng ge·teilt;", "what custom has sternly divided;"],
  ["al·le Men·schen wer·den Brü·der,", "all people become brothers"],
  ["wo dein sanf·ter Flü·gel weilt.", "where your gentle wing rests."],
];

/** One voice: bars 1-16 the first time (it waits, comes in with the tune, then takes its own part), bars 1-8 and 9-15 in four parts, bar 16. */
interface Voice {
  name: string;
  body: "soprano" | "alto" | "tenor" | "bass";
  entry: string;
  a: string;
  b: string;
  cadence: string;
}

// G major, four beats to the bar. Bar 12's last note is tied over its bar line: the theme's early entry.
const VOICES: Voice[] = [
  {
    name: "Soprano", body: "soprano",
    entry: "R:47 B4:2 | B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | A4:1.5 G4:.5 G4:2",
    a: "B4 B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | B4:1.5 A4:.5 A4:2 | B4 B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | A4:1.5 G4:.5 G4:2",
    b: "A4 A4 B4 G4 | A4 B4:.5 ~C5:.5 B4 G4 | A4 B4:.5 ~C5:.5 B4 A4 | G4 A4 D4 B4:2 | B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4",
    cadence: "A4:1.5 G4:.5 G4:2",
  },
  {
    name: "Alto", body: "alto",
    entry: "R:32 A4 A4 B4 G4 | A4 B4:.5 ~C5:.5 B4 G4 | A4 B4:.5 ~C5:.5 B4 A4 | G4 A4 D4 G4:2 | G4 G4 G4 | A4 A4 G4 F#4 | D4 E4 E4 G4 | F#4:1.5 F#4:.5 D4:2",
    a: "G4 G4 G4 G4 | A4 A4 G4 F#4 | D4 E4 E4 G4 | G4:1.5 F#4:.5 F#4:2 | G4 G4 G4 G4 | A4 A4 G4 F#4 | D4 E4 E4 G4 | F#4:1.5 F#4:.5 D4:2",
    b: "F#4 F#4 G4 E4 | F#4 G4 G4 E4 | F#4 G4 G4 E4 | E4 E4 D4 G4:2 | G4 G4 G4 | A4 A4 G4 F#4 | D4 E4 E4 G4",
    cadence: "F#4:1.5 F#4:.5 D4:2",
  },
  {
    name: "Tenor", body: "tenor",
    entry: "R:16 B3 B3 C4 D4 | D4 C4 B3 A3 | G3 G3 A3 B3 | A3:1.5 G3:.5 G3:2 | F#3 F#3 G3 E3 | F#3 G3 G3 E3 | F#3 G3 G3 E3 | C#4 C#4 A3 D4:2 | D4 E4 D4 | F#4 F#4 D4 D4 | B3 B3 C4 D4 | C4:1.5 C4:.5 B3:2",
    a: "D4 D4 E4 D4 | F#4 F#4 D4 D4 | B3 B3 C4 D4 | D4:1.5 D4:.5 D4:2 | D4 E4 E4 D4 | F#4 F#4 D4 D4 | B3 B3 C4 D4 | C4:1.5 C4:.5 B3:2",
    b: "D4 D4 D4 B3 | D4 D4 D4 B3 | D4 D4 E4 C#4 | C#4 C#4 A3 D4:2 | D4 E4 D4 | F#4 F#4 D4 D4 | B3 B3 C4 D4",
    cadence: "C4:1.5 C4:.5 B3:2",
  },
  {
    name: "Bass", body: "bass",
    entry: "B2 B2 C3 D3 | D3 C3 B2 A2 | G2 G2 A2 B2 | B2:1.5 A2:.5 A2:2 | G2 G2 C3 B2 | D3 D3 G3 D3 | G3 E3 A2 D3 | D3:1.5 D3:.5 G2:2 | D3 C3 B2 E3 | D3 B2 B2 E3 | D3 B2 E3 A2 | A2 A2 F#3 G3:2 | G3 C3 B2 | D3 D3 G3 D3 | G3 E3 A2 D3 | D3:1.5 D3:.5 G2:2",
    a: "G3 G3 C3 B2 | D3 D3 G3 D3 | G3 E3 C3 B2 | D3:1.5 D3:.5 D3:2 | G3 E3 C3 B2 | D3 D3 G3 D3 | G3 E3 A2 D3 | D3:1.5 D3:.5 G2:2",
    b: "D3 C3 B2 E3 | D3 B2 B2 E3 | D3 B2 E3 A2 | A2 A2 F#3 G3:2 | G3 C3 B2 | D3 D3 G3 D3 | G3 E3 A2 D3",
    cadence: "D3:1.5 D3:.5 G2:2",
  },
];

/** A stanza: sixteen bars. */
const STANZA = 64;
const stanza = (v: Voice) => `${v.a} ${v.b} ${v.cadence}`;
const lastHeld = (v: Voice) => `${v.b} ${v.cadence.replace(/:2$/, `:${FINAL}`)}`;
const soprano = VOICES[0];
const byName = (notes: (v: Voice) => string) => Object.fromEntries(VOICES.map((v) => [v.name, notes(v)]));

/** The form, as the stanza beat each section starts on: the entries, the stanza in four parts, then its second half again (as Beethoven repeats it). */
const FORM = [0, 0, STANZA / 2];
/** The second half's first syllable: the 31st, "Dei-". */
const HALF = 30;

const SONG: Section[] = [
  { words: WORDS, tune: stanza(soprano), parts: byName((v) => v.entry), lines: LINES },
  { words: WORDS, tune: stanza(soprano), parts: byName(stanza), lines: LINES },
  { words: WORDS.slice(HALF), tune: lastHeld(soprano), parts: byName(lastHeld), lines: LINES.slice(4) },
];

/** The timpani's drum for each pitch class of the bass: D2, E2, G2, A2 and C3. */
const KETTLES: Record<number, number> = { 7: 43, 11: 43, 2: 38, 6: 38, 9: 45, 4: 40, 0: 48 };

// ── the band's parts, from the choir's harmony: [bass, tenor, alto, soprano] on each half beat of the stanza in four parts ──

function band(clock: BeatClock): BandPart[] {
  const at = clock.at;
  const beat = clock.beat;
  const harmony: number[][] = Array.from({ length: STANZA * 2 }, () => []);
  for (const v of [...VOICES].reverse()) {
    let k = 0;
    for (const n of readNotes(stanza(v))) for (let j = 0; j < n.beats * 2; j++) harmony[k++].push(n.midi);
  }
  const starts = FORM.map((_, i) => FORM.slice(0, i).reduce((s, from) => s + STANZA - from, 0));
  const { beats } = startsOf(SONG);
  /** The stanza beat at song beat `t`. */
  const stanzaBeat = (t: number) => {
    let i = starts.length - 1;
    while (i > 0 && t < starts[i]) i--;
    return FORM[i] + t - starts[i];
  };
  const section = (b: number) => starts.reduce((k, s, i) => (b >= s ? i : k), 0);
  const chord = (b: number) => harmony[Math.min(STANZA * 2 - 1, Math.floor(stanzaBeat(b) * 2))];
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  /** The last chord's beat. */
  const last = beats - FINAL;
  const harp: BandNote[] = [];
  const bass: BandNote[] = [];
  const strings: BandNote[] = [];
  const timpani: BandNote[] = [];

  // the introduction: two bars of broken chords, tonic then dominant, over the bass's two notes
  "G3 B3 D4 G4 B4 D5 G5 D5 F#3 A3 C4 D4 F#4 A4 C5 A4".split(" ").forEach((name, i) => harp.push(note(at(-INTRO + i / 2), readNotes(name)[0].midi, 2.2, 0.55 + 0.03 * i)));
  bass.push(note(at(-8), 31, beat * 2, 0.8), note(at(-4), 38, beat * 2, 0.8));
  /** The timpani's note under a bass note: the drums are tuned within D2..C3. */
  const kettle = (pc: number) => KETTLES[pc] ?? 43;
  for (let b = 0; b < last; b++) {
    const [B, T, A, S] = chord(b);
    const sb = stanzaBeat(b);
    const s = section(b);
    const i = sb % 4;
    // while the bass sings alone the band only marks the beat
    const sparse = s === 0 && sb < 16;
    const tones = [...new Set([T, A, S])].sort((x, y) => x - y);
    if (tones.length < 3) tones.push(tones[0] + 12);
    // the harp: low, middle, high, middle through each chord, an octave brighter with the full choir
    harp.push(note(at(b), i % 2 === 0 ? tones[0] : tones[2], 2.2, sparse ? 0.42 : 0.8));
    if (!sparse) harp.push(note(at(b + 0.5), tones[1] + (s > 0 ? 12 : 0), 2.2, 0.6));
    // the plucked bass: an octave under the choir's, on the bar's strong beats
    if (i === 0 || (i === 2 && !sparse)) bass.push(note(at(b), B - 12, beat * 1.6, sparse ? 0.6 : i === 0 ? 0.9 : 0.7));
    // timpani once the choir is whole: every other bar and the cadences, then every bar
    if (s === 1 && (sb % 8 === 0 || sb === 30 || sb === 62)) timpani.push(note(at(b), kettle(B % 12), 1, 0.7));
    if (s === 2 && i === 0) timpani.push(note(at(b), kettle(B % 12), 1, 0.85));
  }
  // the bowed strings hold the three lower parts from the soprano's entry to the end
  for (let v = 0; v < 3; v++) {
    let open: BandNote | null = null;
    for (let h = 47 * 2; h < beats * 2; h++) {
      const m = chord(h / 2)[v];
      if (open && open.midi === m) continue;
      if (open) open.d = at(h / 2) - open.t;
      open = note(at(h / 2), m, 0, 0.7);
      strings.push(open);
    }
    if (open) open.d = at(beats) - open.t;
  }
  // the last chord: the harp rolls it upward, the bass plucks its root, the timpani roll under it
  [43, 50, 55, 59, 62, 67, 71, 74, 79].forEach((m, k) => harp.push(note(at(last) + 0.045 * k, m, 4, 0.75)));
  bass.push(note(at(last), 31, beat * FINAL, 1));
  for (let q = 0; q < FINAL * 4 - 2; q++) timpani.push(note(at(last + q / 4), 43, 0.5, 0.9 * (q < 2 ? 1 : 0.35 + 0.5 * Math.sin((Math.PI * q) / (FINAL * 4)))));

  return [writtenPart("harp", harp), writtenPart("bass", bass), writtenPart("strings", strings), writtenPart("timpani", timpani)];
}

const METER = 4;

export const FREUDE: Song = {
  id: "freude",
  title: "Ode an die Freude",
  credit: "Ludwig van Beethoven, 1824; words by Friedrich Schiller, 1785; harmony and band written for Orpheon",
  lang: "ipa",
  meter: METER,
  bpm: BPM,
  ...writtenTune(SONG, METER),
  voices: VOICES.map((v) => writtenVoice(SONG, { name: v.name, body: v.body }, METER)),
  intro: INTRO,
  band: { instruments: ["harp", "bass", "strings", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
