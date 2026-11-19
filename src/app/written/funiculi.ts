// "Funiculì, funiculà": Luigi Denza's tune (1880) on Peppino Turco's Neapolitan words, written
// for the opening of the funicular up Vesuvius, for four voices with piano, guitar, flute, a
// double bass and a drum kit. Written for Orpheon, bright and quick (six eighths to the bar):
//
//   introduction  the flute plays the refrain's last line twice over the piano and the guitar
//   verse 1       in F: the tenor alone; the women answer each line's tag ("tu saje addó?")
//   refrain 1     everyone, in four parts, the piano and the kit come in
//   bridge        a bar for the band on D seven: the rest is a tone higher
//   verse 2       in G: the tenor again, the women and the bass answering
//   refrain 2     everyone, the flute over the soprano, ending on the high "là"
//   ending        the refrain's last line once more, broadened, the last chord held
//
// The tune is the song's own (verse and refrain as Denza wrote them, read here in E flat and moved
// up into F and G); the harmony and the band were written for this arrangement: a dominant pedal
// under "jamme, jamme", a bass falling E flat D C B C under "funiculì, funiculà", no voice crossing
// another, no parallel fifths or octaves. The Neapolitan is sung from IPA in the full vowels of
// sung Italian, the stressed syllable of each word marked. All of it is in the public domain.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Harmony, chordAt, near, readChords, strum, voicing } from "./chords.ts";
import { type Section, held, moved, readNotes, readSyllables, startsOf, stretched, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

/** Eighths a minute: a dotted quarter at 108. */
const BPM = 324;
const METER = 6;
/** Eighths of the flute's introduction before the first pickup ("Ais-"). */
const INTRO = 47;
/** Eighths the last chord is held beyond its note, and how much the ending broadens. */
const FINAL = 6;
const BROADEN = 1.5;
/** Semitones from the notation's E flat to the first verse's F and the second verse's G. */
const IN_F = 2;
const IN_G = 4;

// ── a verse in E flat, line by line: each line the solo (with its pickup) and the tag the others answer ──
// A line is 54 eighths (the last 55): the solo 38, a rest, the tag 12, the rest of the bar.
const SOLO_1 = "Bb4 | Eb5:8 Eb5 D5:2 D5 | Bb4:2 Bb4 C5:2 C5 | G4:3 G4:5 G4 F4:2 Eb4 | Eb4:7";
const SOLO_3 = "G4 | G4:8 G4 A4:2 A4 | G4:2 G4 A4:2 A4 | G4:3 G4:5 D4 D4:2 D4 | D4:7";
const SOLO_4 = "Bb4 | Bb4:8 Bb4 C5:2 C5 | Bb4:2 Bb4 C5:2 C5 | Bb4:3 Bb4:5 F4 F4:2 F4 | F4:7";
/** The tags, in three parts: the tune (the soprano), the alto, the bass. */
const TAG_1 = { S: "G4 F4:2 Eb4 Eb4:8", A: "Eb4 D4:2 Bb3 G3:8", B: "Eb3 Bb2:2 Eb3 Eb3:8" };
const TAG_3 = { S: "D4 D4:2 D4 D4:8", A: "Bb3 Ab3:2 Bb3 Bb3:8", B: "Bb2 Bb2:2 Bb2 Bb2:8" };
const TAG_4 = { S: "F4 F4:2 F4 F4:8", A: "D4 Eb4:2 D4 Ab3:8", B: "Bb2 Bb2:2 Bb2 Bb2:8" };
const LINES_OF_VERSE: [string, typeof TAG_1][] = [[SOLO_1, TAG_1], [SOLO_1, TAG_1], [SOLO_3, TAG_3], [SOLO_4, TAG_4]];
const tail = (i: number) => (i === 3 ? 4 : 3);
const VERSE_TUNE = LINES_OF_VERSE.map(([solo, tag], i) => `${solo} R ${tag.S} R:${tail(i)}`).join(" ");
const verseSolo = LINES_OF_VERSE.map(([solo], i) => `${moved(solo, -12)} R:${13 + tail(i)}`).join(" ");
const verseTag = (part: "S" | "A" | "B") => LINES_OF_VERSE.map(([, tag], i) => `R:39 ${tag[part]} R:${tail(i)}`).join(" ");
const VERSE_CHORDS = [
  "Bb7:1 Eb:6 Eb:3 Bb7:3 Bb7:6 Eb:6 Eb:3 Bb7:2 Eb:1 Eb:6 Eb:3 Bb7:2 Eb:1 Eb:6 Eb:5",
  "Bb7:1 Eb:6 Eb:3 Bb7:3 Bb7:6 Eb:6 Eb:3 Bb7:2 Eb:1 Eb:6 Eb:3 Bb7:2 Eb:1 Eb:6 Eb:5",
  // "Addó lo fuoco coce": the tune's A natural, as ii and V of B flat; the tag on B flat itself
  "Eb:1 Cm:6 Cm:3 F7:3 Cm:3 F7:3 Cm:3 F7:3 F7:2 Bb:4 Bb:6 Bb:6 Bb:6 Bb:5",
  "Bb7:1 Eb:6 Eb:3 Ab:3 Eb:3 Ab:3 Eb:6 Eb:2 Bb7:4 Bb7:6 Bb7:6 Bb7:6 Bb7:6",
].join(" ");

// ── the refrain in E flat, four parts (16 bars, 96 eighths) ──
const REFRAIN = {
  S: "D5:3 C5 R:2 | D5:3 C5 R:2 | Eb5:2 D5 C5:2 Eb5 | D5:5 R | D5:3 C5 R:2 | D5:3 C5 R:2 | Eb5:2 D5 C5:2 Eb5 | Bb4 R G4 G4:2 G4 | G4:2 G4 G4:2 G4 | G4:2 G4 G4:2 G4 | G4:2 G4 G4:2 G4 | Eb5:6 | F5:2 Eb5 C5:2 Eb5 | Bb4 R G4 G4:2 Ab4 | Bb4:2 Ab4 G4:2 F4 | Eb4:2 R:4",
  A: "Bb4:3 Ab4 R:2 | Bb4:3 Ab4 R:2 | G4:2 F4 Ab4:2 G4 | F4:5 R | Bb4:3 Ab4 R:2 | Bb4:3 Ab4 R:2 | G4:2 F4 Ab4:2 G4 | G4 R Eb4 Eb4:2 Eb4 | F4:2 F4 F4:2 F4 | Eb4:2 Eb4 Eb4:2 Eb4 | F4:2 F4 F4:2 F4 | G4:6 | Ab4:2 Ab4 Ab4:2 Ab4 | G4 R Eb4 Eb4:2 F4 | F4:2 F4 Eb4:2 D4 | Bb3:2 R:4",
  T: "D4:3 Eb4 R:2 | D4:3 Eb4 R:2 | Bb3:2 Bb3 Eb4:2 Bb3 | D4:5 R | D4:3 Eb4 R:2 | D4:3 Eb4 R:2 | Bb3:2 Bb3 Eb4:2 Bb3 | Bb3 R Bb3 Bb3:2 Bb3 | B3:2 B3 B3:2 B3 | C4:2 C4 C4:2 C4 | D4:2 D4 D4:2 D4 | C4:6 | C4:2 C4 Eb4:2 C4 | Eb4 R Bb3 Bb3:2 D4 | D4:2 D4 Bb3:2 Ab3 | G3:2 R:4",
  B: "Bb2:3 Bb2 R:2 | Bb2:3 Bb2 R:2 | Bb2:2 Bb2 Bb2:2 Bb2 | Bb2:5 R | Bb2:3 Bb2 R:2 | Bb2:3 Bb2 R:2 | Bb2:2 Bb2 Bb2:2 Bb2 | Eb3 R Eb3 Eb3:2 Eb3 | D3:2 D3 D3:2 D3 | C3:2 C3 C3:2 C3 | B2:2 B2 B2:2 B2 | C3:6 | Ab2:2 Ab2 Ab2:2 Ab2 | Bb2 R Bb2 Bb2:2 Bb2 | Bb2:2 Bb2 Bb2:2 Bb2 | Eb3:2 R:4",
};
/** The second refrain ends on the high "là", so the last line can come again from above. */
const lastBar = (src: string, bar: string) => src.replace(/\| [^|]+$/, `| ${bar}`);
const REFRAIN_HIGH = { S: lastBar(REFRAIN.S, "Eb5:2 R:4"), A: lastBar(REFRAIN.A, "G4:2 R:4"), T: lastBar(REFRAIN.T, "Bb3:2 R:4"), B: REFRAIN.B };
const REFRAIN_CHORDS =
  "Bb:3 Ab/Bb:3 Bb:3 Ab/Bb:3 Eb/Bb:2 Bb:1 Ab/Bb:2 Eb/Bb:1 Bb:6 Bb:3 Ab/Bb:3 Bb:3 Ab/Bb:3 Eb/Bb:2 Bb:1 Ab/Bb:2 Eb/Bb:1 Eb:6 G7/D:6 Cm:6 G7/B:6 Cm:6 Fm7/Ab:6 Eb/Bb:5 Bb7:1 Bb7:6 Eb:6";
/** The first refrain's last bar turns to the new key's dominant (C seven here is D seven in F). */
const REFRAIN_TO_G = REFRAIN_CHORDS.replace(/Eb:6$/, "Eb:2 C7:4");

// ── the ending: the refrain's last line, its last bar climbing to the high tonic (24 eighths before it broadens) ──
const LAST = {
  S: "F5:2 Eb5 C5:2 Eb5 | Bb4 R G4 G4:2 Ab4 | Bb4:2 C5 D5:2 D5 | Eb5:6",
  A: "Ab4:2 Ab4 Ab4:2 Ab4 | G4 R Eb4 Eb4:2 F4 | G4:2 Ab4 F4:2 Ab4 | G4:6",
  T: "C4:2 C4 Eb4:2 C4 | Eb4 R Bb3 Bb3:2 D4 | Eb4:2 Eb4 D4:2 D4 | Bb3:6",
  B: "Ab2:2 Ab2 Ab2:2 Ab2 | Bb2 R Bb2 Bb2:2 Bb2 | Bb2:2 Ab2 Bb2:2 Bb2 | Eb2:6",
};
const LAST_CHORDS = `Fm7/Ab:${6 * BROADEN} Eb/Bb:${5 * BROADEN} Bb7:${BROADEN} Eb/Bb:${2 * BROADEN} Ab:${BROADEN} Bb7:${3 * BROADEN} Eb:${6 * BROADEN + FINAL}`;
const ending = (src: string) => moved(held(stretched(src, BROADEN), FINAL), IN_G);

// ── the words ──
const VERSE_1 = readSyllables(`
  Ais /a i/s ; se ˈs/ɛ/ ; ra ɾ/a/_ ; Nan n/a/n ; ni n/i/ ; né ˈn/e/_ ; me m/e/_ ; ne n/e/_ ; sa s/a/ʎ ; gliet ˈʎ/e/t ; te t/e/,
  tu t/u/_ ; saje ˈs/a i/_ ; ad /a/d ; dó ˈd/o/, ; tu t/u/_ ; saje ˈs/a i/_ ; ad /a/d ; dó ˈd/o/,
  Ad /a/d ; dó ˈd/o/_ ; 'stu s t/u/_ ; co ˈk/ɔ/ ; re ɾ/e/_ ; 'ngra ˈŋ g ɾ/a/ ; to t/o/_ ; cchiù ˈk j/u/_ ; di d/i/ ; spiet ˈs p j/e/t ; to t/o/,
  far ˈf/a/ɾ ; me m/e/_ ; nun n/u/n_ ; pò ˈp/ɔ/, ; far ˈf/a/ɾ ; me m/e/_ ; nun n/u/n_ ; pò ˈp/ɔ/,
  Ad /a/d ; dó ˈd/o/_ ; lo l/o/_ ; fuo ˈf w/ɔ/ ; co k/o/_ ; co ˈk/o/ ; ce tʃ/e/_ ; ma m/a/_ ; se s/e/_ ; fu ˈf/u/ ; je j/e/,
  te t/e/_ ; las ˈl/a/s ; sa s/a/_ ; sta ˈs t/a/, ; te t/e/_ ; las ˈl/a/s ; sa s/a/_ ; sta ˈs t/a/,
  E /e/_ ; nun n/u/n_ ; te t/e/_ ; cor ˈk/o/r ; reap r/e a̯/p ; pries ˈp ɾ j/ɛ/s ; so s/o/_ ; nun n/u/n_ ; te t/e/_ ; stru ˈs t ɾ/u/ ; je j/e/,
  su ˈs/u/ ; loa l/o a̯/_ ; guar g w/a/ɾ ; dà ˈd/a/, ; su ˈs/u/ ; loa l/o a̯/_ ; guar g w/a/ɾ ; dà ˈd/a/,
`);
const VERSE_2 = readSyllables(`
  Né ˈn/e/_ ; jam ˈj/a/m ; me m/e/_ ; da d/a/_ ; la l/a/_ ; ter ˈt/ɛ/r ; raa r/a/_ ; la l/a/_ ; mon m/o/n ; ta ˈt/a/ɲ ; gna ɲ/a/,
  nu n/u/_ ; pas ˈp/a/s ; so s/o/_ ; nc'è ˈn tʃ/ɛ/, ; nu n/u/_ ; pas ˈp/a/s ; so s/o/_ ; nc'è ˈn tʃ/ɛ/,
  Se s/e/_ ; vè ˈv/ɛ/ ; de d/e/_ ; Fran ˈf ɾ/a/n ; cia tʃ/a/_ ; Pro ˈp ɾ/o/ ; ce tʃ/e/ ; tae t/a e̯/_ ; la l/a/_ ; Spa ˈs p/a/ɲ ; gna ɲ/a/,
  Io ˈj/o/_ ; ve ˈv/e/ ; coa k/o a̯/t_ ; tte ˈt/e/, ; Io ˈj/o/_ ; ve ˈv/e/ ; coa k/o a̯/t_ ; tte ˈt/e/,
  Ti t/i/ ; ra ˈɾ/a/ ; to t/o/_ ; co k/o/_ ; la l/a/_ ; fu ˈf/u/ ; ne n/e/_ ; dit ˈd/i/t ; to t/o/_ ; 'nfat ˈm f/a/t ; to t/o/,
  'ncie ˈn tʃ/e/ ; lo l/o/_ ; se s/e/_ ; va ˈv/a/, ; 'ncie ˈn tʃ/e/ ; lo l/o/_ ; se s/e/_ ; va ˈv/a/,
  Se s/e/_ ; va ˈv/a/_ ; comm k/o/m_ ; 'a m/a/_ ; lo l/o/_ ; vien ˈv j/ɛ/n ; toa t/o a̯/_ ; l'in l/i/n ; tra t ɾ/a/ ; sat ˈs/a/t ; to t/o/,
  guè ˈg w/ɛ/_ ; sa ˈs/a/ʎ ; glie ʎ/e/_ ; sà ˈs/a/, ; guè ˈg w/ɛ/_ ; sa ˈs/a/ʎ ; glie ʎ/e/_ ; sà ˈs/a/,
`);
const JAMME = "Jam ˈj/a/m ; me m/e/, ; jam ˈj/a/m ; me m/e/_ ; 'ncop ˈŋ k/ɔ/p ; pa p/a/_ ; jam ˈj/a/m ; me m/e/_ ; jà ˈj/a/,";
/** "Funiculì, funiculà", sung straight on ("_") or ending its phrase (","). */
const cable = (end: "_" | ",") => `fu f/u/ ; ni n/i/ ; cu k/u/ ; lì ˈl/i/_ ; fu f/u/ ; ni n/i/ ; cu k/u/ ; là ˈl/a/${end}`;
const NCOPPA = `'ncop ˈŋ k/ɔ/p ; pa p/a/_ ; jam ˈj/a/m ; me m/e/_ ; jà ˈj/a/, ; ${cable(",")}`;
const REFRAIN_WORDS = readSyllables(`${JAMME} ; ${JAMME} ; ${cable("_")} ; ${cable(",")} ; ${NCOPPA}`);

/** Caption lines: "·" parts the syllables, a no-break space ( ) joins two words sung as one ("ra a"). */
const VERSE_1_LINES: [string, string][] = [
  ["Ais·se·ra, Nan·ni·né, me ne sa·gliet·te,", "Last night, Nannina, I went up high,"],
  ["tu saje ad·dó? Tu saje ad·dó?", "do you know where? Do you know where?"],
  ["Ad·dó ’stu co·re ’ngra·to cchiù di·spiet·to", "where this ungrateful heart"],
  ["far·me nun pò! Far·me nun pò!", "can hurt me no more!"],
  ["Ad·dó lo fuo·co co·ce, ma se fu·je", "where the fire burns, but if you run,"],
  ["te las·sa sta! Te las·sa sta!", "it leaves you alone!"],
  ["E nun te cor·re ap·pries·so, nun te stru·je", "it doesn’t chase you, it doesn’t wear you down"],
  ["su·lo a guar·dà! Su·lo a guar·dà!", "just by looking!"],
];
const REFRAIN_LINES: [string, string][] = [
  ["Jam·me, jam·me, ’ncop·pa, jam·me jà,", "Let’s go, let’s go, up to the top, let’s go,"],
  ["jam·me, jam·me, ’ncop·pa, jam·me jà,", "let’s go, let’s go, up to the top, let’s go,"],
  ["fu·ni·cu·lì, fu·ni·cu·là!", "on the funicular, up we go!"],
  ["fu·ni·cu·lì, fu·ni·cu·là!", "on the funicular, up we go!"],
  ["’ncop·pa, jam·me jà, fu·ni·cu·lì, fu·ni·cu·là!", "up to the top, let’s go, funiculì, funiculà!"],
];
const VERSE_2_LINES: [string, string][] = [
  ["Né, jam·me da la ter·ra a la mon·ta·gna", "Come on, from the ground up to the mountain"],
  ["nu pas·so nc’è! Nu pas·so nc’è!", "it’s only a step!"],
  ["Se vè·de Fran·cia, Pro·ce·ta e la Spa·gna…", "you can see France, Procida and Spain…"],
  ["Io ve·co a tte! Io ve·co a tte!", "and I see you!"],
  ["Ti·ra·to co la fu·ne, dit·to ’nfat·to,", "pulled by the cable, no sooner said than done,"],
  ["’ncie·lo se va! ’Ncie·lo se va!", "up to the sky we go!"],
  ["Se va comm’ ’a lo vien·to a l’in·tra·sat·to,", "we go like the wind, all of a sudden,"],
  ["guè, sa·glie, sà! Guè, sa·glie, sà!", "hey, up and up we climb!"],
];

const inF = (src: string) => moved(src, IN_F);
const inG = (src: string) => moved(src, IN_G);
/** Verse 2 starts after the bridge: five eighths for the band alone, then its pickup. */
const BRIDGE = 5;

const SONG: Section[] = [
  // the tenor alone, the women answering
  {
    words: VERSE_1, tune: inF(VERSE_TUNE), lines: VERSE_1_LINES,
    parts: { Soprano: inF(verseTag("S")), Alto: inF(verseTag("A")), Tenor: inF(verseSolo) },
  },
  { words: REFRAIN_WORDS, tune: inF(REFRAIN.S), lines: REFRAIN_LINES, parts: { Soprano: inF(REFRAIN.S), Alto: inF(REFRAIN.A), Tenor: inF(REFRAIN.T), Bass: inF(REFRAIN.B) } },
  // a tone higher: the tenor, the women and the bass answering
  {
    words: VERSE_2, tune: `R:${BRIDGE} ${inG(VERSE_TUNE)}`, lines: VERSE_2_LINES,
    parts: { Soprano: `R:${BRIDGE} ${inG(verseTag("S"))}`, Alto: `R:${BRIDGE} ${inG(verseTag("A"))}`, Tenor: `R:${BRIDGE} ${inG(verseSolo)}`, Bass: `R:${BRIDGE} ${inG(verseTag("B"))}` },
  },
  { words: REFRAIN_WORDS, tune: inG(REFRAIN_HIGH.S), lines: REFRAIN_LINES, parts: { Soprano: inG(REFRAIN_HIGH.S), Alto: inG(REFRAIN_HIGH.A), Tenor: inG(REFRAIN_HIGH.T), Bass: inG(REFRAIN_HIGH.B) } },
  {
    words: readSyllables(NCOPPA), tune: ending(LAST.S), lines: [REFRAIN_LINES[4]],
    parts: { Soprano: ending(LAST.S), Alto: ending(LAST.A), Tenor: ending(LAST.T), Bass: ending(LAST.B) },
  },
];

// ── the band ──

/** The whole song's chords, in their keys, on song beats (the introduction before 0). */
function harmony(): Harmony[] {
  const { starts } = startsOf(SONG);
  const intro = "Fm7/Ab:6 Eb/Bb:5 Bb7:1 Bb7:6 Eb:6 Fm7/Ab:6 Eb/Bb:5 Bb7:1 Bb7:6 Eb:5";
  return [
    ...readChords(intro, -INTRO, IN_F),
    ...readChords(VERSE_CHORDS, starts[0], IN_F),
    ...readChords(REFRAIN_TO_G, starts[1], IN_F),
    ...readChords(`Bb7:${BRIDGE} ${VERSE_CHORDS}`, starts[2], IN_G),
    ...readChords(REFRAIN_CHORDS, starts[3], IN_G),
    ...readChords(LAST_CHORDS, starts[4], IN_G),
  ];
}

const KICK = 36;
const STICK = 37;
const SNARE = 38;
const HAT = 42;
const CRASH = 49;
const TOMS = [50, 48, 47, 45];

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const chords = harmony();
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t, d, midi, velocity });
  const piano: BandNote[] = [];
  const guitar: BandNote[] = [];
  const flute: BandNote[] = [];
  const bass: BandNote[] = [];
  const kit: BandNote[] = [];
  const end = starts[4];
  /** Eighths into the bar: song beat 1 is a downbeat (the song opens on a pickup). */
  const place = (b: number) => (((b - 1) % METER) + METER) % METER;
  const inRefrain = (b: number) => (b >= starts[1] && b < starts[2] - 4) || b >= starts[3];
  const bridge = (b: number) => b >= starts[2] - 4 && b < starts[2] + BRIDGE + 1;

  for (let b = -INTRO; b < end; b++) {
    const c = chordAt(chords, b);
    const p = place(b);
    const firstVerse = b >= 0 && b < starts[1];
    // the double bass on the bar's two beats: the bass, then the fifth unless the chord names its bass
    if (p === 0) bass.push(note(at(b), near(c.bass, 41, 33, 52), 2.4 * beat, 0.75));
    if (p === 3) bass.push(note(at(b), near(c.slash ? c.bass : (c.root + 7) % 12, 45, 33, 52), 2.4 * beat, 0.62));
    // the guitar strums down on the beats and up on the eighth before them: D . U D . U
    if (p === 0 || p === 3) strum(guitar, at(b), voicing(c, 52, 4), 1.6 * beat, firstVerse ? 0.5 : 0.56);
    if (p === 2 || p === 5) strum(guitar, at(b), voicing(c, 55, 3), 0.9 * beat, 0.36, true);
    // the piano off the beat, from the introduction on except in the first verse
    if (!firstVerse && (p === 1 || p === 2 || p === 4 || p === 5)) {
      voicing(c, 62, 3).forEach((m) => piano.push(note(at(b), m, 0.7 * beat, p === 1 || p === 4 ? 0.34 : 0.42)));
    }
    // the kit: only time in the introduction and the second verse, the whole kit in the refrains
    if (firstVerse || bridge(b)) continue;
    if (inRefrain(b) || b < 0) {
      if (p === 0) kit.push(note(at(b), KICK, 0.3, 0.72));
      if (p === 3) kit.push(note(at(b), b < 0 ? KICK : SNARE, 0.25, b < 0 ? 0.45 : 0.55));
      kit.push(note(at(b), HAT, 0.1, p === 0 || p === 3 ? 0.32 : 0.2));
    } else {
      if (p === 0) kit.push(note(at(b), KICK, 0.3, 0.55));
      if (p === 3) kit.push(note(at(b), STICK, 0.2, 0.4));
      kit.push(note(at(b), HAT, 0.1, p === 0 || p === 3 ? 0.24 : 0.15));
    }
  }
  // cymbals where the refrains begin, and the bridge's fill into the second verse
  for (const b of [starts[1], starts[3]]) kit.push(note(at(b), CRASH, 1.5, 0.55));
  const fill = starts[2] + BRIDGE - 4;
  TOMS.forEach((m, k) => kit.push(note(at(fill + k), m, 0.4, 0.4 + 0.08 * k)));
  kit.push(note(at(starts[2] + BRIDGE + 1), CRASH, 1.5, 0.5));

  // the flute: the refrain's last line twice in the introduction; then over the choir, an octave up
  const play = (src: string, from: number, shift: number, velocity: number) => {
    let t = from;
    for (const n of readNotes(src)) {
      if (n.midi) flute.push(note(at(t), n.midi + shift, n.beats * beat * 0.92, velocity));
      t += n.beats;
    }
  };
  const lastLine = REFRAIN.S.split("|").slice(12).join("|");
  play(`${lastLine} | ${lastLine}`, -INTRO, IN_F, 0.6);
  play(REFRAIN.S, starts[1], IN_F + 12, 0.32);
  play(`R:${BRIDGE} ${verseTag("S")}`, starts[2], IN_G + 12, 0.4);
  play(REFRAIN_HIGH.S, starts[3], IN_G + 12, 0.36);
  play(ending(LAST.S), starts[4], 12, 0.4);

  // the ending: each chord struck as it comes, the last held, the kit closing on it
  const last = beats - FINAL - 6 * BROADEN;
  for (const c of chords.filter((c) => c.t >= end - 1e-9)) {
    const d = c.d * beat;
    strum(guitar, at(c.t), voicing(c, 52, 5), d, 0.55);
    [near(c.bass, 38, 33, 50), ...voicing(c, 60, 4)].forEach((m) => piano.push(note(at(c.t), m, d, 0.45)));
    bass.push(note(at(c.t), near(c.bass, 41, 33, 52), d, 0.75));
    kit.push(note(at(c.t), KICK, 0.3, 0.6));
  }
  for (let q = 0; q < 6; q++) kit.push(note(at(last - 3 + q / 2), SNARE, 0.15, 0.25 + 0.08 * q));
  kit.push(note(at(last), CRASH, 3, 0.7));

  return [writtenPart("piano", piano), writtenPart("guitar", guitar), writtenPart("flute", flute), writtenPart("bass", bass), writtenPart("kit", kit)];
}

export const FUNICULI: Song = {
  id: "funiculi",
  title: "Funiculì, funiculà",
  credit: "Luigi Denza, 1880; Neapolitan words by Peppino Turco, 1880; arrangement written for Orpheon",
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
  band: { instruments: ["piano", "guitar", "flute", "bass", "kit"], parts: band },
  captions: writtenCaptions(SONG),
};
