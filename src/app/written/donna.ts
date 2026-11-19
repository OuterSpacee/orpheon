// "La donna è mobile": the Duke's canzone from Giuseppe Verdi's "Rigoletto" (1851), words by
// Francesco Maria Piave, for four voices with strings, guitar, a double bass, a flute and timpani.
// Written for Orpheon, quick and light (three eighths to the bar), a tone under Verdi's B major:
//
//   introduction  the flute plays the theme over the band's um-pa-pa, a pause, a bar of the vamp
//   verse 1       the tenor alone, the Duke's tune
//   verse 2       the bass joins under him
//   refrain       the tune goes up to the soprano, everyone in four parts; the tenor's cadenza
//                 alone ("e... e di pensier"), the strings holding under it
//   ritornello    the flute again, half the theme
//   verse 3       the women alone, the soprano with the tune
//   verse 4       everyone
//   refrain       everyone; the tenor's last cadenza ends on the high A, the choir joining on it
//
// The tune, its rhythm and the cadenza are Verdi's (Ricordi's vocal score of 1851, read here from a
// Paris edition of it, moved down a tone so the tenor's top note is his A). The harmony and the
// band were written for this arrangement: a bass rising G sharp to E under the refrain, no voice
// crossing another, no parallel fifths or octaves. The Italian is sung from IPA, the stressed
// syllable of each word marked, two vowels across a word's end sung on one note. All of it is in
// the public domain.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Harmony, chordAt, near, readChords, voicing } from "./chords.ts";
import { type Section, held, moved, readNotes, readSyllables, startsOf, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

/** Eighths a minute. */
const BPM = 138;
const METER = 3;
/** The flute's theme (8 bars), its pause (2 eighths) and a bar of the vamp before the voice. */
const INTRO = 29;
/** Eighths the last chord is held beyond its note. */
const FINAL = 6;

// ── the theme (8 bars) in A major, where the tenor sings it; the soprano sings it an octave up ──
const THEME = "C#4 C#4 C#4 | E4:.75 D4:.25 B3:2 | B3 B3 B3 | D4:.75 ~C#4:.25 A3:2 | C#4 B3 A3 | A3:.75 ~G#3:.25 G#3:2 | B3 A3 F#3 | F#3:.75 ~E3:.25 E3:2";
const THEME_CHORDS = "A:3 E7:3 E7:3 A:3 A:3 E:3 D:3 E:3";
const up = (src: string) => moved(src, 12);
/** Under the tenor's tune in verse 2: the bass alone. */
const BASS_2 = "A2 A2 A2 | E2:.75 E2:.25 G#2:2 | G#2 B2 E3 | A2 A2:2 | A2 B2 C#3 | E2 E2:2 | D3 D3 D3 | E3 E2:2";
/** Under the soprano's tune: verse 3 (the women), verse 4 (everyone). */
const ALTO_3 = "A4 A4 A4 | G#4:.75 G#4:.25 G#4:2 | G#4 G#4 G#4 | E4 E4:2 | E4 D4 C#4 | E4 E4:2 | F#4 F#4 D4 | D4 B3:2";
const VERSE_4 = {
  A: "A4 A4 A4 | G#4:.75 G#4:.25 G#4:2 | G#4 E4 D4 | E4 E4:2 | E4 D4 C#4 | E4 E4:2 | F#4 F#4 D4 | B3 B3:2",
  T: "E4 E4 E4 | E4:.75 E4:.25 D4:2 | D4 B3 B3 | C#4 C#4:2 | A3 G#3 A3 | B3 B3:2 | A3 A3 A3 | G#3 G#3:2",
  B: "A2 A2 A2 | E2:.75 E2:.25 G#2:2 | E3 E3 E3 | A2 A2:2 | A2 B2 C#3 | E2 E2:2 | D3 D3 D3 | E3 E3:2",
};

// ── the refrain (12 bars, two of them for the band alone), the soprano with the tune ──
const REFRAIN = {
  S: "B4:.75 ~C#5:.25 B4 B4 | E5:.5 R:.5 B4:2 | C#5:.75 ~D5:.25 C#5 C#5 | F#5:.5 R:.5 D5:2 | E5:.75 ~F#5:.25 E5 E5 | F#5:2 E5 | D5:.25 ~E5:.25 ~D5:.5 C#5:.5 R:.5 B4:.5 R:.5 | A4:2 R | R:6 | D5:.25 ~E5:.25 ~D5:.5 C#5:.5 R:.5 B4:.5 R:.5 | A4:2 R",
  A: "E4 E4 E4 | E4:.5 R:.5 E4:2 | E4 E4 E4 | F#4:.5 R:.5 F#4:2 | A4 A4 A4 | A4:2 F#4 | G#4 A4:.5 R:.5 G#4:.5 R:.5 | E4:2 R | R:6 | G#4 A4:.5 R:.5 G#4:.5 R:.5 | E4:2 R",
  T: "D4 D4 D4 | C#4:.5 R:.5 C#4:2 | C#4 C#4 C#4 | D4:.5 R:.5 B3:2 | A3 A3 A3 | A3:2 A3 | E4 E4:.5 R:.5 D4:.5 R:.5 | C#4:2 R | R:6 | E4 E4:.5 R:.5 D4:.5 R:.5 | C#4:2 R",
  B: "G#2 G#2 G#2 | A2:.5 R:.5 A2:2 | A#2 A#2 A#2 | B2:.5 R:.5 B2:2 | C#3 C#3 C#3 | D3:2 D3 | E3 E3:.5 R:.5 E3:.5 R:.5 | A2:2 R | R:6 | E3 E3:.5 R:.5 E2:.5 R:.5 | A2:2 R",
};
const REFRAIN_TUNE = moved(REFRAIN.S, -12);
const REFRAIN_CHORDS = "E7/G#:3 A:3 F#7/A#:3 Bm:3 A/C#:3 D:3 E7:1 A/E:1 E7:1 A:3 E7:3 A:3 E7:1 A/E:1 E7:1 A:3";
/**
 * The tenor's cadenza: "e" held through four bars and a chromatic step, then "e di pensier" down
 * the scale (Verdi's dotted pairs). The last one turns up on "pen" to the high A, held.
 */
const CADENZA = "E4:11 ~F4 G#4:.75 ~F#4:.25 E4:.75 ~D4:.25 C#4:.75 ~B3:.25 A3:2 R";
const LAST_CADENZA = held("E4:11 ~F4 G#4:.75 ~F#4:.25 E4:.75 ~D4:.25 C#4:.75 ~E4:.25 A4:3", FINAL);
/** Eighths into the cadenza where its last syllable ("sier") begins. */
const SIER = 15;
const CADENZA_CHORDS = "A/E:9 E7b9:3 E7:3 A:3";
/** The ritornello before verse 3: the theme's first half on the flute, a pause, a bar of the vamp. */
const RITORNELLO = 18;
const RITORNELLO_CHORDS = "A:3 E7:3 E7:3 A:3 A:3 A:3";

// ── the words ──
const VERSE_1 = readSyllables(`
  La l/a/_ ; don ˈd/ɔ/n ; naè n/a ɛ̯/_ ; mo ˈm/ɔ/ ; bi b/i/ ; le l/e/_
  qual k w/a/l_ ; piu ˈp j/u/ ; maal m/a/l_ ; ven ˈv/ɛ/n ; to t/o/,
  mu ˈm/u/ ; ta t/a/_ ; d'ac d/a/t ; cen ˈtʃ/ɛ/n ; to t/o/_
  e /e/_ ; di d/i/_ ; pen p/e/n ; sie ˈs j/ɛ/ ; ro ɾ/o/,
`);
const VERSE_2 = readSyllables(`
  Sem ˈs/ɛ/m ; preun p ɾ/e u/n_ ; a /a/ ; ma ˈm/a/ ; bi b/i/ ; le l/e/_
  leg l/e/d ; gia ˈdʒ/a/ ; dro d ɾ/o/_ ; vi ˈv/i/ ; so z/o/,
  in /i/n_ ; pian ˈp j/a/n ; toin t/o i/n_ ; ri ˈɾ/i/ ; so z/o/_
  è ˈ/ɛ/_ ; men m/e/n ; zo dz/o/ɲ ; gne ˈɲ/ɛ/ ; ro ɾ/o/,
`);
const VERSE_3 = readSyllables(`
  È ˈ/ɛ/_ ; sem ˈs/ɛ/m ; pre p ɾ/e/_ ; mi ˈm/i/ ; se z/e/ ; ro ɾ/o/_
  chia k j/a/_ ; lei ˈl/ɛ i/_ ; s'af s/a/f ; fi ˈf/i/ ; da d/a/,
  chi k/i/_ ; le l/e/_ ; con k/o/n ; fi ˈf/i/ ; da d/a/_
  mal m/a/l_ ; cau ˈk/a u/ ; toil t/o i/l_ ; cuo ˈk w/ɔ/ ; re ɾ/e/,
`);
const VERSE_4_WORDS = readSyllables(`
  Pur p/u/ɾ_ ; mai ˈm/a i/_ ; non n/o/n_ ; sen ˈs/ɛ/n ; te t/e/ ; si s/i/_
  fe f/e/ ; li ˈl/i/ ; ceap tʃ/e a̯/p_ ; pie ˈp j/ɛ/ ; no n/o/,
  chi k/i/_ ; su s/u/_ ; quel k w/e/l_ ; se ˈs/e/ ; no n/o/_
  non n/o/n_ ; li ˈl/i/ ; baa b/a/_ ; mo ˈm/o/ ; re ɾ/e/,
`);
const PENSIER = "e /e/_ ; di d/i/_ ; pen p/e/n ; sier ˈs j/ɛ/ɾ,";
const REFRAIN_WORDS = readSyllables(`
  La l/a/_ ; don ˈd/ɔ/n ; naè n/a ɛ̯/_ ; mo ˈm/ɔ/ ; bil b/i/l_
  qual k w/a/l_ ; piu ˈp j/u/ ; maal m/a/l_ ; ven ˈv/ɛ/n ; to t/o/,
  mu ˈm/u/ ; ta t/a/_ ; d'ac d/a/t ; cen ˈtʃ/ɛ/n ; to t/o/_ ; ${PENSIER} ; ${PENSIER}
  e /e/_ ; ${PENSIER}
`);

/** Caption lines: "·" parts the syllables, a no-break space ( ) joins two words sung on one note. */
const VERSE_LINES: [string, string][][] = [
  [["La don·na è mo·bi·le", "Woman is fickle"], ["qual piu·ma al ven·to,", "as a feather in the wind,"], ["mu·ta d’ac·cen·to", "she changes her words"], ["e di pen·sie·ro.", "and her mind."]],
  [["Sem·pre un a·ma·bi·le,", "Always a lovely,"], ["leg·gia·dro vi·so,", "graceful face,"], ["in pian·to o in ri·so,", "in tears or in laughter,"], ["è men·zo·gne·ro.", "is telling lies."]],
  [["È sem·pre mi·se·ro", "He is always wretched"], ["chi a lei s’af·fi·da,", "who trusts in her,"], ["chi le con·fi·da", "who rashly gives her"], ["mal cau·to il cuo·re!", "his unguarded heart!"]],
  [["Pur mai non sen·te·si", "And yet no man feels"], ["fe·li·ce ap·pie·no", "wholly happy"], ["chi su quel se·no", "who on that breast"], ["non li·ba a·mo·re!", "does not sip love!"]],
];
const REFRAIN_LINES: [string, string][] = [
  ["La don·na è mo·bil", "Woman is fickle"],
  ["qual piu·ma al ven·to,", "as a feather in the wind,"],
  ["mu·ta d’ac·cen·to", "she changes her words"],
  ["e di pen·sier,", "and her mind,"],
  ["e di pen·sier,", "and her mind,"],
  ["e… e di pen·sier!", "and her mind!"],
];

const SONG: Section[] = [
  // the tenor alone; then the bass under him
  { words: VERSE_1, tune: THEME, lines: VERSE_LINES[0], parts: { Tenor: THEME } },
  { words: VERSE_2, tune: THEME, lines: VERSE_LINES[1], parts: { Tenor: THEME, Bass: BASS_2 } },
  // the refrain in four parts, the tune now the soprano's; the tenor's cadenza alone
  {
    words: REFRAIN_WORDS, tune: `${REFRAIN_TUNE} ${CADENZA}`, lines: REFRAIN_LINES,
    parts: { Soprano: `${REFRAIN.S} R:18`, Alto: `${REFRAIN.A} R:18`, Tenor: `${REFRAIN.T} ${CADENZA}`, Bass: `${REFRAIN.B} R:18` },
  },
  // the ritornello, then the women alone
  { words: VERSE_3, tune: `R:${RITORNELLO} ${THEME}`, lines: VERSE_LINES[2], parts: { Soprano: `R:${RITORNELLO} ${up(THEME)}`, Alto: `R:${RITORNELLO} ${ALTO_3}` } },
  { words: VERSE_4_WORDS, tune: THEME, lines: VERSE_LINES[3], parts: { Soprano: up(THEME), Alto: VERSE_4.A, Tenor: VERSE_4.T, Bass: VERSE_4.B } },
  // the refrain again; the choir comes back in on the tenor's high A
  {
    words: REFRAIN_WORDS, tune: `${REFRAIN_TUNE} ${LAST_CADENZA}`, lines: REFRAIN_LINES,
    parts: {
      Soprano: `${REFRAIN.S} R:${SIER} E5:${3 + FINAL}`,
      Alto: `${REFRAIN.A} R:${SIER} C#5:${3 + FINAL}`,
      Tenor: `${REFRAIN.T} ${LAST_CADENZA}`,
      Bass: `${REFRAIN.B} R:${SIER} A2:${3 + FINAL}`,
    },
  },
];

// ── the band ──

/** The whole song's chords on song beats (the introduction before 0). */
function harmony(): Harmony[] {
  const { starts } = startsOf(SONG);
  return [
    ...readChords(`${THEME_CHORDS} E:2 A:3`, -INTRO),
    ...readChords(THEME_CHORDS, starts[0]),
    ...readChords(THEME_CHORDS, starts[1]),
    ...readChords(`${REFRAIN_CHORDS} ${CADENZA_CHORDS}`, starts[2]),
    ...readChords(`${RITORNELLO_CHORDS} ${THEME_CHORDS}`, starts[3]),
    ...readChords(THEME_CHORDS, starts[4]),
    ...readChords(`${REFRAIN_CHORDS} A/E:9 E7b9:3 E7:3 A:${3 + FINAL}`, starts[5]),
  ];
}

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const chords = harmony();
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const strings: BandNote[] = [];
  const guitar: BandNote[] = [];
  const bass: BandNote[] = [];
  const flute: BandNote[] = [];
  const timpani: BandNote[] = [];
  const refrainBars = 36;
  const cadenzas = [starts[2] + refrainBars, starts[5] + refrainBars];
  /** Where the um-pa-pa stops: the introduction's pause, the cadenzas, the ritornello's pause, the last chord. */
  const pauses: [number, number][] = [[-5, -3], [cadenzas[0], cadenzas[0] + SIER], [starts[3] + 12, starts[3] + 15], [cadenzas[1], beats]];
  const paused = (b: number) => pauses.some(([a, z]) => b >= a - 1e-9 && b < z - 1e-9);
  /** Eighths into the bar: the introduction's theme counts from its own start. */
  const place = (b: number) => (b < -5 ? (b + INTRO) % 3 : ((b % 3) + 3) % 3);
  const inRefrain = (b: number) => (b >= starts[2] && b < cadenzas[0]) || b >= starts[5];

  // the um-pa-pa: the double bass on the bar, the guitar's chord on the two eighths after it
  for (let b = -INTRO; b < beats; b++) {
    if (paused(b)) continue;
    const c = chordAt(chords, b);
    const p = place(b);
    if (p === 0) bass.push(note(at(b), near(c.bass, 40, 33, 50), 0.45, b >= starts[4] ? 0.8 : 0.7));
    else voicing(c, 57, 3).forEach((m, k) => guitar.push(note(at(b) + 0.008 * k, m, 0.32, b >= starts[4] ? 0.5 : 0.42)));
  }
  // the strings hold the harmony from verse 2 on (and in the introduction), fuller in the refrains
  for (const c of chords) {
    if (c.t >= starts[0] && c.t < starts[1]) continue;
    const loud = c.t >= cadenzas[1] ? 0.55 : inRefrain(c.t) || c.t < 0 ? 0.45 : c.t >= cadenzas[0] && c.t < starts[3] ? 0.5 : 0.32;
    voicing(c, 64, 3).forEach((m) => strings.push(note(at(c.t), m, c.d * beat, loud)));
    strings.push(note(at(c.t), near(c.bass, 50, 36, 55), c.d * beat, loud * 0.8));
  }
  // the flute: the theme in the introduction (its last note held through the pause), half of it
  // in the ritornello, "e di pensier" answered in the refrains' two bars for the band
  const play = (src: string, from: number, velocity: number, last = 0) => {
    let t = from;
    const notes = readNotes(src);
    notes.forEach((n, i) => {
      if (n.midi) flute.push(note(at(t), n.midi, (n.beats + (i === notes.length - 1 ? last : 0)) * beat * 0.95, velocity));
      t += n.beats;
    });
  };
  play(up(THEME), -INTRO, 0.6, 2);
  play(up(THEME.split("|").slice(0, 4).join("|")), starts[3], 0.6, 3);
  const answer = REFRAIN.S.split("|").slice(6, 8).join("|");
  for (const s of [starts[2], starts[5]]) play(answer, s + 24, 0.5);
  flute.push(note(at(cadenzas[1] + SIER), 81, (3 + FINAL) * beat, 0.45));

  // the timpani: the refrains' first beats, a roll under each cadenza's held note, the last chord
  for (const s of [starts[2], starts[5]]) {
    timpani.push(note(at(s), 40, 0.6, 0.5));
    timpani.push(note(at(s + 21), 45, 0.6, 0.45));
  }
  const roll = (from: number, eighths: number, midi: number, soft: number, loud: number) => {
    for (let q = 0; q < eighths * 2; q++) timpani.push(note(at(from + q / 2), midi, 0.35, soft + ((loud - soft) * q) / (eighths * 2)));
  };
  roll(cadenzas[0], 9, 40, 0.15, 0.45);
  roll(cadenzas[1], 9, 40, 0.15, 0.5);
  roll(cadenzas[1] + SIER, 3 + FINAL - 1, 45, 0.3, 0.6);
  timpani.push(note(at(beats - 1), 45, 1, 0.7));
  bass.push(note(at(cadenzas[0] + SIER), 33, 0.6, 0.75));
  bass.push(note(at(cadenzas[1] + SIER), 33, (3 + FINAL) * beat, 0.8));

  return [writtenPart("strings", strings), writtenPart("guitar", guitar), writtenPart("bass", bass), writtenPart("flute", flute), writtenPart("timpani", timpani)];
}

export const DONNA: Song = {
  id: "donna",
  title: "La donna è mobile",
  credit: "Giuseppe Verdi, “Rigoletto”, 1851; words by Francesco Maria Piave; arrangement written for Orpheon",
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
  band: { instruments: ["strings", "guitar", "bass", "flute", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
