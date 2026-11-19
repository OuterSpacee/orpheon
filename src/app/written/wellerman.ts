// "Soon may the Wellerman come": a New Zealand whaling song of the shore-whaling days, tune and
// words traditional, as Neil Colquhoun collected and printed it in the 1960s. Arranged for
// Orpheon as a shanty is sung: a lead voice gives each verse, the crew answers with the chorus,
// and feet and hands keep the time.
//
//   introduction  two bars of stomps and claps
//   verse 1       the bass alone ("There once was a ship"), the stomps under him
//   chorus        the men: the tenor with the tune, the bass under it; the double bass comes in
//   verse 2       the tenor leads, the bass on the roots; the guitar strums
//   chorus        all four voices in harmony; strings, and a whistle (the flute) at the long notes
//   verse 3       the women alone, in thirds, over the stomps and the guitar ("the fight's still on")
//   chorus        everyone, the whistle with the tune an octave up
//   last chorus   voices and stomps alone for two lines, then the band again, and the last
//                 "go" held on A major
//
// A minor, the chords the tune implies (F to C under "Soon may the Wellerman come", D minor and
// A minor under "sugar and tea and rum", E at "bully boys"), voiced by hand: no voice crosses
// another, no parallel fifths or octaves.
import type { BandNote, BandPart } from "../../contract.ts";
import type { BeatClock, Song } from "../songs.ts";
import { type Section, moved, readNotes, readPlain, startsOf, writtenCaptions, writtenPart, writtenTune, writtenVoice } from "./notation.ts";

const BPM = 132;
const METER = 4;
/** Beats of stomps before the first pickup ("There"): two bars less the pickup's half beat. */
const INTRO = 7.5;
/** The last "go", in beats. */
const LAST_GO = 8;

/**
 * Notes on another line's rhythm: one pitch for each of `rhythm`'s notes, lengths and "~" taken
 * from it. A part that sings every syllable with the tune, on its own pitches.
 */
function alongside(rhythm: string, pitches: string): string {
  const beats = rhythm.split(/[\s|]+/).filter(Boolean);
  const notes = pitches.split(/[\s|]+/).filter(Boolean);
  if (beats.length !== notes.length) throw new Error(`${notes.length} pitches for ${beats.length} notes`);
  return beats
    .map((token, i) => {
      const m = /^(~?)[^:]+(:[\d.]+)?$/.exec(token)!;
      return `${m[1]}${notes[i].replace(/^~/, "")}${m[2] ?? ""}`;
    })
    .join(" ");
}

// ── the tune, in the soprano's octave (the tenor sings it an octave down, the bass two) ──
// Each verse opens on a half-beat pickup and fills eight bars; a chorus starts on the bar.
const V1 = "E5:.5 | A4 A4:.5 A4:.5 A4 C5 | E5 E5 E5:1.5 E5:.5 | F5 D5:.5 D5:.5 D5 F5:.5 F5:.5 | A5 A5:.5 E5:.5 E5:1.5 E5:.5 | A4 A4 A4 C5 | E5 E5 E5:1.5 E5:.5 | F5:1.5 D5:.5 C5 C5 | B4:2 A4:2";
const V2 = "E5:.5 | A4 A4 A4 C5 | E5 E5 E5:1.5 E5:.5 | F5 D5 D5 F5 | A5 A5 E5:1.5 E5:.5 | A4 A4 A4 C5 | E5 E5 E5:1.5 E5:.5 | F5:1.5 D5:.5 C5:1.5 C5:.5 | B4:2 ~A4:2";
const V3 = "E5:.5 | A4 A4:.5 A4:.5 A4 C5 | E5 E5 E5:1.5 E5:.5 | F5 D5 D5 F5:.5 F5:.5 | A5:1.5 E5:.5 E5:1.5 E5:.5 | A4 A4:.5 A4:.5 A4 C5 | E5 E5:.5 E5:.5 E5 E5:.5 E5:.5 | F5 D5:.5 D5:.5 C5 C5 | B4 B4 A4:2";
/** The chorus, its last "go" `go` beats long (3½ when a verse's pickup follows, 4 before a chorus). */
const chorus = (go: number) => `A5 A5:.5 F5:.5 G5 G5:.5 E5:.5 | E5:3.5 E5:.5 | F5 D5 D5 D5:.5 F5:.5 | A5:1.5 E5:.5 E5:2 | A5 A5:.5 F5:.25 F5:.25 G5 G5:.5 E5:.5 | E5:3.5 E5:.5 | F5:1.5 D5:.5 C5 B4 | A4:${go}`;

// ── the chorus in four parts, on the tune's rhythm ──
const CHORUS_ALTO = "C5 C5 C5 C5 C5 C5 | C5 C5 | D5 A4 A4 A4 A4 | C5 C5 C5 | C5 C5 C5 C5 C5 C5 C5 | C5 C5 | D5 A4 A4 G#4 | E4";
const CHORUS_TENOR = "F4 F4 A4 E4 E4 G4 | G4 G4 | A4 F4 F4 F4 F4 | E4 E4 E4 | F4 F4 A4 A4 E4 E4 G4 | G4 G4 | A4 F4 E4 E4 | C4";
const CHORUS_BASS = "F3 F3 F3 C3 C3 C3 | C3 E3 | D3 D3 D3 D3 D3 | A2 A2 A2 | F3 F3 F3 F3 C3 C3 C3 | C3 E3 | D3 D3 A2 E3 | A2";
/** The last chorus ends on A major: the tenor's C sharpened. */
const picardy = (src: string) => src.replace(/C4$/, "C#4");

// ── the verses' other parts ──
/** Verse 2: the bass on the roots under the tenor's tune, rising to C at the end (from A, the octave with the tenor would move in parallel into the chorus). */
const V2_BASS = alongside(V2, "A2 | A2 A2 A2 A2 | C3 C3 C3 C3 | D3 D3 D3 D3 | A2 A2 A2 A2 | A2 A2 A2 A2 | C3 C3 C3 C3 | D3 D3 A2 A2 | E3 C3");
/** Verse 3: the alto a third or a fourth under the soprano, on the chord's own notes. */
const V3_ALTO = alongside(V3, "C5 | E4 E4 E4 E4 A4 | C5 C5 C5 C5 | D5 A4 A4 D5 D5 | C5 C5 C5 C5 | E4 E4 E4 E4 A4 | C5 C5 C5 C5 C5 C5 | D5 A4 A4 A4 A4 | G#4 G#4 E4");

const WORDS = {
  v1: readPlain("There once was a ship that put to sea, the name of the ship was the Bil-ly of Tea. The winds blew up, her bow dipped down, O blow, my bul-ly boys, blow!"),
  v2: readPlain("She had not been two weeks from shore, when down on her a right whale bore. The cap-tain called all hands and swore, heed take that whale in tow."),
  v3: readPlain("As far as I've heard, the fight's still on; the line's not cut and the whale's not gone. The Wel-ler man makes his re-gu-lar call to en-cour-age the cap-tain, crew and all."),
  // "we'll" sung as "weal" (the reader would take "well"), "our" as "are" (the reader makes it two
  // syllables, "ow-er"); "Wel-ler man" in two words, so the stress falls on "Wel" as sung
  chorus: readPlain("Soon may the Wel-ler man come, to bring us su-gar and tea and rum. One day when the tong-uing is done, weal take are leave and go."),
};

const LINES: Record<keyof typeof WORDS, [string, string][]> = {
  v1: [["There once was a ship that put to sea,", ""], ["the name of the ship was the Bil·ly of Tea;", ""], ["the winds blew up, her bow dipped down,", ""], ["O blow, my bul·ly boys, blow!", ""]],
  v2: [["She had not been two weeks from shore", ""], ["when down on her a right whale bore;", ""], ["the cap·tain called all hands and swore", ""], ["he’d take that whale in tow.", ""]],
  v3: [["As far as I’ve heard, the fight’s still on;", ""], ["the line’s not cut and the whale’s not gone.", ""], ["The Wel·ler·man makes his re·gu·lar call", ""], ["to en·cour·age the cap·tain, crew and all.", ""]],
  chorus: [["Soon may the Wel·ler·man come", ""], ["to bring us su·gar and tea and rum;", ""], ["one day, when the ton·guin’ is done,", ""], ["we’ll take our leave and go.", ""]],
};

/**
 * A chorus for all four voices. Before another chorus the alto ends on A, not E: from E under the
 * bass's A to C over F would be parallel fifths.
 */
function fullChorus(go: number, last = false, chorusNext = false): Record<string, string> {
  const tune = chorus(go);
  return {
    Soprano: tune,
    Alto: alongside(tune, chorusNext ? CHORUS_ALTO.replace(/E4$/, "A4") : CHORUS_ALTO),
    Tenor: alongside(tune, last ? picardy(CHORUS_TENOR) : CHORUS_TENOR),
    Bass: alongside(tune, CHORUS_BASS),
  };
}

const SONG: Section[] = [
  { words: WORDS.v1, tune: V1, parts: { Bass: moved(V1, -24) }, lines: LINES.v1 },
  { words: WORDS.chorus, tune: chorus(3.5), parts: { Tenor: moved(chorus(3.5), -12), Bass: alongside(chorus(3.5), CHORUS_BASS) }, lines: LINES.chorus },
  { words: WORDS.v2, tune: V2, parts: { Tenor: moved(V2, -12), Bass: V2_BASS }, lines: LINES.v2 },
  { words: WORDS.chorus, tune: chorus(3.5), parts: fullChorus(3.5), lines: LINES.chorus },
  { words: WORDS.v3, tune: V3, parts: { Soprano: V3, Alto: V3_ALTO }, lines: LINES.v3 },
  { words: WORDS.chorus, tune: chorus(4), parts: fullChorus(4, false, true), lines: LINES.chorus },
  { words: WORDS.chorus, tune: chorus(LAST_GO), parts: fullChorus(LAST_GO, true), lines: LINES.chorus },
];

// ── the band ──

/** The chords as pitch classes, root first. */
const CHORDS: Record<string, number[]> = { Am: [9, 0, 4], C: [0, 4, 7], Dm: [2, 5, 9], F: [5, 9, 0], E: [4, 8, 11], A: [9, 1, 4] };
/** A verse's chords from its first bar (after the pickup), and a chorus's from its start. */
const VERSE_CHORDS: [string, number][] = [["Am", 4], ["C", 4], ["Dm", 4], ["Am", 4], ["Am", 4], ["C", 4], ["Dm", 2], ["Am", 2], ["E", 2], ["Am", 2]];
const chorusChords = (go: number, last: boolean): [string, number][] => [["F", 2], ["C", 2], ["C", 4], ["Dm", 4], ["Am", 4], ["F", 2], ["C", 2], ["C", 4], ["Dm", 2], ["Am", 1], ["E", 1], [last ? "A" : "Am", go]];

/** A chord of the band's: from song beat `t` for `d` beats. */
interface Span {
  t: number;
  d: number;
  name: string;
}

/** The whole song's chords: each verse's pickup under the chord before it (A minor). */
function harmony(): Span[] {
  const { starts } = startsOf(SONG);
  const spans: Span[] = [];
  SONG.forEach((section, i) => {
    const isVerse = section.words === WORDS.v1 || section.words === WORDS.v2 || section.words === WORDS.v3;
    let t = starts[i];
    const go = readNotes(section.tune).at(-1)!.beats;
    const grid: [string, number][] = isVerse ? [["Am", 0.5], ...VERSE_CHORDS] : chorusChords(go, i === SONG.length - 1);
    for (const [name, d] of grid) {
      spans.push({ t, d, name });
      t += d;
    }
  });
  return spans;
}

/** The pitch of pitch class `pc` nearest `near`. */
const near = (pc: number, to: number) => to + ((((pc - to) % 12) + 18) % 12) - 6;

/** A guitar's open-position chord, lowest string first. */
const GUITAR: Record<string, number[]> = {
  Am: [45, 52, 57, 60, 64],
  C: [48, 52, 55, 60, 64],
  Dm: [50, 57, 62, 65],
  F: [41, 48, 53, 57, 60, 65],
  E: [40, 47, 52, 56, 59, 64],
  A: [45, 52, 57, 61, 64],
};

function band(clock: BeatClock): BandPart[] {
  const { at, beat } = clock;
  const { starts, beats } = startsOf(SONG);
  const spans = harmony();
  const note = (t: number, midi: number, d: number, velocity: number): BandNote => ({ t: at(t), d: d * beat, midi, velocity });
  const kit: BandNote[] = [];
  const bass: BandNote[] = [];
  const guitar: BandNote[] = [];
  const strings: BandNote[] = [];
  const flute: BandNote[] = [];
  const timpani: BandNote[] = [];

  const [, chorus1, verse2, chorus2, verse3, chorus3, chorus4] = starts;
  /** The last chorus's third line, where the band comes back. */
  const comeBack = chorus4 + 16;
  /** The downbeat of the last "go". */
  const lastGo = beats - LAST_GO;
  const playing = (from: number, to: number) => (b: number) => b >= from - 1e-9 && b < to - 1e-9;
  const quiet = playing(chorus4, comeBack);

  // stomps on the first and third beat, claps on the second and fourth, from the introduction to the last "go"
  for (let b = -INTRO; b < lastGo - 1e-9; b += 1) {
    const inBar = ((((b - 0.5) % 4) + 4) % 4);
    const soft = b >= verse3 && b < chorus3 ? 0.8 : 1;
    if (inBar === 0 || inBar === 2) kit.push(note(b, 36, 0.5, (inBar === 0 ? 1 : 0.85) * soft));
    else kit.push(note(b, 39, 0.3, 0.75 * soft));
  }
  // a crash where the full chorus starts, where the band comes back, and on the last chord
  for (const b of [chorus3, comeBack, lastGo]) kit.push(note(b, 49, 2, 0.6));
  kit.push(note(lastGo, 36, 1, 1));

  for (const s of spans) {
    const tones = CHORDS[s.name];
    if (s.t < chorus1 - 1e-9 || quiet(s.t)) continue;
    const isLast = s.t >= lastGo - 1e-9;
    // the double bass: the root on the bar's first beat, the fifth on its third
    for (let k = 0; s.d >= 2 && k < s.d - 1e-9; k += 2) {
      const b = s.t + k;
      const onThird = (((b - 0.5) % 4) + 4) % 4 === 2;
      const midi = near(tones[0], 36) + (onThird && s.d > 2 ? 7 : 0);
      bass.push(note(b, midi, isLast ? LAST_GO : Math.min(1.8, s.d - k), isLast ? 0.85 : 0.72));
    }
    if (s.d < 2) bass.push(note(s.t, near(tones[0], 36), s.d * 0.9, 0.7));
    // the guitar from the second verse: a full strum on each beat, the top strings on the off-beat
    if (s.t >= verse2 - 1e-9) {
      const shape = GUITAR[s.name];
      const soft = s.t >= verse3 && s.t < chorus3 ? 0.75 : 1;
      if (isLast) shape.forEach((m, k) => guitar.push(note(s.t + 0.02 * k, m, LAST_GO, 0.6)));
      else
        for (let e = 0; e < s.d - 1e-9; e += 0.5) {
          const down = e % 1 === 0;
          const strings6 = down ? shape : shape.slice(-3).reverse();
          strings6.forEach((m, k) => guitar.push(note(s.t + e + 0.015 * k, m, 0.55, (down ? 0.55 : 0.32) * soft)));
        }
    }
    // the strings from the second chorus, out for the women's verse: the chord held in the middle
    if (s.t >= chorus2 - 1e-9 && !(s.t >= verse3 - 1e-9 && s.t < chorus3 - 1e-9)) {
      const pad = [near(tones[0], 48), near(tones[1], 62), near(tones[2], 66), near(tones[0], 69)];
      pad.forEach((m) => strings.push(note(s.t, m, s.d, isLast ? 0.7 : 0.55)));
    }
  }

  // the whistle: little runs under the long "come" and "done" in the second chorus
  const runs = ["C6:.5 D6:.5 E6:.5 G6:.5 E6:.5", "E6:.5 D6:.5 C6:.5 A5:.5 G5:.5"];
  for (const [k, offset] of [4, 20].entries()) {
    let t = chorus2 + offset + 1;
    for (const n of readNotes(runs[k])) {
      flute.push(note(t, n.midi, n.beats * 0.95, 0.5));
      t += n.beats;
    }
  }
  // then the tune an octave up through the full chorus, and through the last from the band's return
  for (const [section, from] of [[5, chorus3], [6, comeBack]]) {
    let t = starts[section];
    for (const n of readNotes(SONG[section].tune)) {
      if (t >= from - 1e-9 && n.midi) flute.push(note(t, n.midi + 12, n.beats * 0.92, 0.45));
      t += n.beats;
    }
  }

  // the timpani: a stroke as the full choir enters, a roll into the full chorus, a stroke on the band's return, a roll under the last chord
  timpani.push(note(chorus2, 41, 1.5, 0.6));
  for (let q = 0; q < 8; q++) timpani.push(note(chorus3 - 2 + q / 4, 40, 0.3, 0.25 + 0.05 * q));
  timpani.push(note(chorus3, 41, 1.5, 0.75));
  timpani.push(note(comeBack, 41, 1.5, 0.75));
  for (let q = 0; q < LAST_GO * 4; q++) timpani.push(note(lastGo + q / 4, 45, 0.3, 0.3 + 0.35 * Math.sin((Math.PI * (q + 1)) / (LAST_GO * 4 + 1))));

  return [writtenPart("kit", kit), writtenPart("bass", bass), writtenPart("guitar", guitar), writtenPart("strings", strings), writtenPart("flute", flute), writtenPart("timpani", timpani)];
}

export const WELLERMAN: Song = {
  id: "wellerman",
  title: "Soon may the Wellerman come",
  credit: "New Zealand whaling song, traditional, as collected by Neil Colquhoun in the 1960s; arrangement written for Orpheon",
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
  band: { instruments: ["kit", "bass", "guitar", "strings", "flute", "timpani"], parts: band },
  captions: writtenCaptions(SONG),
};
