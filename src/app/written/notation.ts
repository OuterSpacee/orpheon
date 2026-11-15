// Songs written out whole, as a choir master writes them: the words syllable by syllable in IPA,
// then section by section the notes each voice sings, and the captions. From that this works out
// each voice's own notes and words (a voice sings the syllable that starts on each of its notes,
// and a note marked "~" carries the syllable before it on), the tune a single voice would sing,
// and when each caption piece is sung. The songs themselves are anandaloke.ts and freude.ts.
//
// Notes: a pitch and octave (C4 is middle C), ":" and beats when not 1; "R" is a rest; "~" in
// front of a note carries the syllable before it on (a melisma); "|" is only for the eye.
//
// Syllables: "letters onset/nucleus/coda", separated by ";" or new lines, the sounds in IPA with
// spaces between them; "_" after a word's last syllable, "," after a phrase's (a breath there).
import { INSTRUMENTS } from "../../contract.ts";
import type { BandNote, BandPart, InstrumentId } from "../../contract.ts";
import { BAND_MIX } from "../../lang/band-parts.ts";
import type { BeatCaption, ChoirVoice } from "../songs.ts";

export interface Syllable {
  /** Its letters, as the captions light them. */
  text: string;
  /** Its sounds, run together: what the IPA front end reads. */
  ipa: string;
  wordEnd: boolean;
  phraseEnd: boolean;
}

export interface WrittenNote {
  /** MIDI; 0 is a rest. */
  midi: number;
  beats: number;
  melisma: boolean;
}

/** A stretch of a song: its words on its tune's rhythm, each voice's notes, and its caption lines. */
export interface Section {
  words: Syllable[];
  /** The tune: a syllable starts on each of its notes that is not marked "~". */
  tune: string;
  /** Each voice's notes, by its name; a voice not named rests through the section. */
  parts: Record<string, string>;
  /** Each caption line as written ("·" parts the pieces lit one at a time) and what it means. */
  lines: [string, string][];
}

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL: Record<string, number> = { "": 0, "#": 1, b: -1 };

export function readSyllables(src: string): Syllable[] {
  return src
    .trim()
    .split(/\s*\n\s*/)
    .flatMap((line) => line.split(/\s*;\s*/))
    .filter(Boolean)
    .map((s) => {
      const m = /^(\S+)\s+([^/]*)\/([^/]+)\/([^_,]*)([_,]?)$/.exec(s);
      if (!m) throw new Error(`not a syllable: "${s}"`);
      const ipa = (m[2] + m[3] + m[4]).replace(/\s+/g, "");
      return { text: m[1], ipa, wordEnd: m[5] !== "", phraseEnd: m[5] === "," };
    });
}

/**
 * Words written plainly, for a song sung by a language's own reader (English, Latin) rather than
 * from IPA: words parted by spaces, a word's syllables by "-", a phrase ending at "," ";" "." "!"
 * or "?". Each syllable is sung as written.
 */
export function readPlain(src: string): Syllable[] {
  const out: Syllable[] = [];
  for (const word of src.trim().split(/\s+/)) {
    const phraseEnd = /[,;.!?:]$/.test(word);
    const pieces = word.replace(/[^\p{L}'’-]/gu, "").split("-").filter(Boolean);
    pieces.forEach((piece, i) => {
      const last = i === pieces.length - 1;
      out.push({ text: piece, ipa: piece.replace(/[’']/g, ""), wordEnd: last, phraseEnd: last && phraseEnd });
    });
  }
  return out;
}

/** Notes moved by `semitones`, in the same notation (a verse in a higher key). */
export function moved(src: string, semitones: number): string {
  if (!semitones) return src;
  return src
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const m = /^(~?)([A-G])([#b]?)(\d)(:[\d.]+)?$/.exec(token);
      if (!m) return token;
      const midi = 12 * (Number(m[4]) + 1) + STEP[m[2]] + ACCIDENTAL[m[3]] + semitones;
      return `${m[1]}${FLAT_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}${m[5] ?? ""}`;
    })
    .join(" ");
}

const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Notes with every length multiplied by `k` (a line broadened at the end). */
export function stretched(src: string, k: number): string {
  return src
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const m = /^(.+?)(?::([\d.]+))?$/.exec(token);
      if (!m || token === "|") return token;
      return `${m[1]}:${Number(m[2] ?? 1) * k}`;
    })
    .join(" ");
}

export function readNotes(src: string): WrittenNote[] {
  return src
    .split(/[\s|]+/)
    .filter(Boolean)
    .map((token) => {
      const rest = /^R(?::([\d.]+))?$/.exec(token);
      if (rest) return { midi: 0, beats: Number(rest[1] ?? 1), melisma: false };
      const m = /^(~?)([A-G])([#b]?)(\d)(?::([\d.]+))?$/.exec(token);
      if (!m) throw new Error(`not a note: "${token}"`);
      return { midi: 12 * (Number(m[4]) + 1) + STEP[m[2]] + ACCIDENTAL[m[3]], beats: Number(m[5] ?? 1), melisma: m[1] === "~" };
    });
}

export const beatsOf = (notes: readonly WrittenNote[]): number => notes.reduce((sum, n) => sum + n.beats, 0);

/** The same notes with the last held `extra` beats longer: a final chord held on. */
export function held(src: string, extra: number): string {
  const tokens = src.split(/[\s|]+/).filter(Boolean);
  const m = /^([^:]+)(?::([\d.]+))?$/.exec(tokens[tokens.length - 1])!;
  tokens[tokens.length - 1] = `${m[1]}:${Number(m[2] ?? 1) + extra}`;
  return tokens.join(" ");
}

/** The beat in its section each syllable starts on: the tune's rhythm. */
export function onsetsOf(section: Section): number[] {
  const onsets: number[] = [];
  let t = 0;
  for (const n of readNotes(section.tune)) {
    // a rest in the tune is no one's syllable (a bar for the band alone, a breath)
    if (!n.melisma && n.midi > 0) onsets.push(t);
    t += n.beats;
  }
  if (onsets.length !== section.words.length) throw new Error(`the tune has ${onsets.length} syllables' notes for ${section.words.length} syllables`);
  return onsets;
}

/** The song beat each section starts on, and the song's length in beats. */
export function startsOf(sections: readonly Section[]): { starts: number[]; beats: number } {
  const starts: number[] = [];
  let beats = 0;
  for (const s of sections) {
    starts.push(beats);
    beats += beatsOf(readNotes(s.tune));
  }
  return { starts, beats };
}

/** One sounding note of a voice and what it sings: a syllable (its index in the whole song's words) or the one before carried on. */
interface Sung {
  note: WrittenNote;
  syllable: number | "hold";
}

/**
 * A voice through the whole song: its notes and, for each sounding one, the syllable that starts
 * on its beat, or for a "~" note the syllable before carried on. `part` picks the voice's notes
 * from a section (the tune for the voice that sings it alone).
 */
function voiceThrough(sections: readonly Section[], part: (s: Section) => string | undefined, who: string): { notes: WrittenNote[]; sung: Sung[] } {
  const notes: WrittenNote[] = [];
  const sung: Sung[] = [];
  let first = 0;
  sections.forEach((section, i) => {
    const onsets = onsetsOf(section);
    const length = beatsOf(readNotes(section.tune));
    const mine = readNotes(part(section) ?? `R:${length}`);
    if (beatsOf(mine) !== length) throw new Error(`${who}, section ${i + 1}: ${beatsOf(mine)} beats for ${length}`);
    let t = 0;
    for (const n of mine) {
      if (n.midi > 0 && n.melisma) {
        if (!sung.length) throw new Error(`${who}: a melisma with no syllable before it`);
        sung.push({ note: n, syllable: "hold" });
      } else if (n.midi > 0) {
        const k = onsets.indexOf(t);
        if (k < 0) throw new Error(`${who}, section ${i + 1}: the note at beat ${t} starts between syllables`);
        sung.push({ note: n, syllable: first + k });
      }
      t += n.beats;
    }
    notes.push(...mine);
    first += section.words.length;
  });
  return { notes, sung };
}

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (midi: number): string => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const length = (beats: number): string => (beats === 1 ? "" : `:${beats}`);

/**
 * Notes in the page's tune notation (songs.ts): a bar line every `meter` beats, a note that runs
 * over one tied across it, so the tests can check every bar is whole.
 */
export function tuneNotation(notes: readonly WrittenNote[], meter: number): string {
  const out: string[] = [];
  let beat = 0;
  for (const n of notes) {
    let left = n.beats;
    while (left > 1e-9) {
      const room = meter - (beat % meter);
      const take = Math.min(left, room);
      left -= take;
      const name = n.midi > 0 ? noteName(n.midi) : "r";
      out.push(name + length(take) + (left > 1e-9 && n.midi > 0 ? "~" : ""));
      beat += take;
      if (beat % meter < 1e-9 && (left > 1e-9 || n !== notes[notes.length - 1])) out.push("|");
    }
  }
  return out.join(" ");
}

/**
 * The words a voice sings, one piece to each of its notes, in the lyrics notation (songs.ts):
 * a word's syllables joined by "-", each after the first opened with "." so the IPA reader takes
 * the boundary from the writer, not from its own guess; "_" for a note that carries the syllable
 * before; a line to each phrase. A word ends, or a phrase, wherever one ends among the syllables
 * since the one sung before (a voice may hold through some of the song's syllables).
 */
function wordsOf(sung: readonly Sung[], words: readonly Syllable[], plain = false): string {
  const lines: string[] = [];
  let line: string[] = [];
  let word: string[] = [];
  let last = -1;
  const endWord = () => {
    if (word.length) line.push(word.join("-"));
    word = [];
  };
  for (const s of sung) {
    if (s.syllable === "hold") {
      word.push("_");
      continue;
    }
    if (last >= 0) {
      const between = words.slice(last, s.syllable);
      if (between.some((w) => w.wordEnd)) endWord();
      if (between.some((w) => w.phraseEnd)) {
        lines.push(line.join(" "));
        line = [];
      }
    }
    // IPA syllables take their boundary from the writer ("."); plain words are parted by "-" alone
    word.push((word.length && !plain ? "." : "") + words[s.syllable].ipa);
    last = s.syllable;
  }
  endWord();
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}

/** A voice as the page sings it: its notes, and its words one to each of its notes. */
export function writtenVoice(sections: readonly Section[], voice: Omit<ChoirVoice, "notes" | "lyrics">, meter: number, plain = false): ChoirVoice {
  const words = sections.flatMap((s) => s.words);
  const { notes, sung } = voiceThrough(sections, (s) => s.parts[voice.name], voice.name);
  return { ...voice, notes: tuneNotation(notes, meter), lyrics: wordsOf(sung, words, plain) };
}

/** The tune alone, as one voice would sing it, and its words. */
export function writtenTune(sections: readonly Section[], meter: number, plain = false): { tune: string; lyrics: string } {
  const words = sections.flatMap((s) => s.words);
  const { notes, sung } = voiceThrough(sections, (s) => s.tune, "the tune");
  return { tune: tuneNotation(notes, meter), lyrics: wordsOf(sung, words, plain) };
}

/** A chord of the written harmony: from song beat `t` for `d` beats, its pitches bass first. */
export interface Chord {
  t: number;
  d: number;
  notes: number[];
}

/**
 * The harmony a section's four written parts make, as chords: a new chord wherever any part moves.
 * `parts` lowest first; `start` the section's first song beat.
 */
export function chordsOf(parts: readonly string[], start: number): Chord[] {
  const lines = parts.map((p) => readNotes(p));
  const onsets = new Set<number>();
  for (const line of lines) {
    let t = 0;
    for (const n of line) {
      onsets.add(t);
      t += n.beats;
    }
  }
  const total = beatsOf(lines[0]);
  const times = [...onsets].filter((t) => t < total - 1e-9).sort((a, b) => a - b);
  const at = (line: WrittenNote[], t: number) => {
    let x = 0;
    for (const n of line) {
      if (t < x + n.beats - 1e-9) return n.midi;
      x += n.beats;
    }
    return 0;
  };
  return times.map((t, i) => ({ t: start + t, d: (times[i + 1] ?? total) - t, notes: lines.map((line) => at(line, t)) }));
}

/** The captions, in song beats: each line from its first syllable to the next line's, the last to the song's end. */
export function writtenCaptions(sections: readonly Section[]): BeatCaption[] {
  const { starts, beats } = startsOf(sections);
  const captions: BeatCaption[] = [];
  sections.forEach((section, i) => {
    const onsets = onsetsOf(section);
    // a piece ends at a "·" or just after a space (the space stays with the word before it)
    const pieces = section.lines.map(([text]) => text.split(/·|(?<= )/));
    if (pieces.flat().length !== section.words.length) throw new Error(`section ${i + 1}: the captions have ${pieces.flat().length} pieces for ${section.words.length} syllables`);
    let k = 0;
    pieces.forEach((line, j) => {
      const syl = line.map((text, m): [number, string] => [starts[i] + onsets[k + m], text]);
      k += line.length;
      captions.push({ from: syl[0][0], to: 0, text: line.join(""), en: section.lines[j][1], syl });
    });
  });
  captions.forEach((c, i) => (c.to = captions[i + 1]?.from ?? beats));
  return captions;
}

/** A written instrument's part, in time order, at the level and place the arranger's mix gives it. */
export function writtenPart(id: InstrumentId, notes: BandNote[]): BandPart {
  const name = INSTRUMENTS.find((i) => i.id === id)?.name ?? id;
  return { instrument: id, name, notes: [...notes].sort((a, b) => a.t - b.t), level: BAND_MIX[id].level, place: BAND_MIX[id].place };
}
