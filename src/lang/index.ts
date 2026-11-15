/**
 * The language layer: words and notes in, a Score out. It decides WHAT sounds are made and
 * WHEN; the voice decides how the body makes them. No audio and no DOM here: the only outside
 * thing it touches is the English dictionary file, which ready("en") loads (by fetch in the
 * page, from disk in bun), or which loadEnglish() takes as text.
 *
 *   speak(text)          a spoken Score: durations, pauses and a pitch line (speech.ts)
 *   sing(notes, lyrics)  a sung Score: syllables on notes (lyrics.ts, fit.ts, singing.ts)
 *   fitLyrics(notes, lyrics)  where sing() puts each syllable, and what it had to bend, for the page
 *   importSong(bytes)    a MIDI or karaoke file to the notes and lyrics sing() takes (song.ts)
 *   acappella(song)      the whole arrangement as up to five sung parts (acappella.ts)
 *   transcribe(text)     what the front end hears in a text, as IPA with syllables and stress
 */
import type { Score } from "../contract.ts";
import { englishLoaded, loadEnglish } from "./en.ts";
import { type Lang, LANGS } from "./langs.ts";
import { type Style, tokenize } from "./language.ts";
import { type LyricFit, planLyrics } from "./fit.ts";
import type { Syl, Token } from "./phones.ts";
import { DEFAULT_VIBRATO, la, singUnits } from "./singing.ts";
import { speakTokens } from "./speech.ts";

export type { Lang } from "./langs.ts";
export { LANGS } from "./langs.ts";

export interface SpeakOptions {
  lang?: Lang;
  /** 1 is an ordinary speaking pace; 2 is twice as fast. */
  rate?: number;
  /** Centre of the speaking pitch in Hz. */
  pitch?: number;
  /** How much the pitch moves: 0 a monotone to 1 lively. */
  lively?: number;
}

/** One note of a tune, in seconds. */
export interface NoteIn {
  t: number;
  d: number;
  /** MIDI note number: 60 is middle C. May be fractional. */
  midi: number;
}

export interface SingOptions {
  lang?: Lang;
  /** Vibrato depth in cents on held notes. */
  vibrato?: number;
  /** Semitones to move the whole tune. */
  transpose?: number;
}

/** Default speaking pitch in Hz. */
export const DEFAULT_SPEAKING_PITCH = 130;

export { loadEnglish } from "./en.ts";
export { DEFAULT_VIBRATO } from "./singing.ts";

let english$: Promise<void> | null = null;

/** Where the dictionary is: next to the page in a browser, in public/ on disk under bun. */
async function fetchDictionary(): Promise<string> {
  const name = "lang/en-dict.txt";
  if (typeof document !== "undefined") {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const res = await fetch(base + name);
    if (!res.ok) throw new Error(`The English dictionary did not load (${res.status}).`);
    return res.text();
  }
  // bun: read the same file from the project's public folder
  const rel = "../../public/" + name;
  const res = await fetch(new URL(rel, import.meta.url));
  return res.text();
}

/** Load whatever a language needs (English needs its dictionary). Resolves at once if nothing. */
export async function ready(lang: Lang): Promise<void> {
  if (lang !== "en" || englishLoaded()) return;
  english$ ??= fetchDictionary().then(loadEnglish, (e) => {
    english$ = null;
    throw e;
  });
  return english$;
}

/** The words and pauses of a text, as the front end hears them. */
export function words(text: string, lang: Lang = "en", style: Style = "speech"): Token[] {
  return tokenize(text, LANGS[lang], style);
}

/** Words to a spoken Score. English before ready("en") falls back on the spelling rules. */
export function speak(text: string, options: SpeakOptions = {}): Score {
  const lang = options.lang ?? "en";
  return speakTokens(words(text, lang, "speech"), {
    lang,
    rate: options.rate ?? 1,
    pitch: options.pitch ?? DEFAULT_SPEAKING_PITCH,
    lively: options.lively ?? 0.5,
  });
}


/**
 * A tune and its words to a sung Score. Each line of the words goes onto a phrase of the tune
 * (fit.ts): a line with as many syllables as its phrase has notes is sung one to a note; one
 * short of notes holds a syllable over the extra note; one with syllables to spare halves its
 * longest notes for them, and only shares a note between two where the notes are too short to
 * halve. "-" inside a word splits it where the writer wants; "_" holds the previous syllable
 * over one more note; "~" keeps syllables on one note. When the words run out, the rest of the
 * tune is sung on "la". The vowel of each note starts exactly at the note's start, so its
 * consonants come before it: start the first note late enough for them (0.3 s is plenty) or
 * they are squeezed.
 */
export function sing(notes: NoteIn[], lyrics: string, options: SingOptions = {}): Score {
  const plan = planLyrics(notes, lyrics, LANGS[options.lang ?? "en"]);
  return singUnits(plan.notes, plan.units, { vibrato: options.vibrato ?? DEFAULT_VIBRATO, transpose: options.transpose ?? 0, filler: la, words: plan.words });
}

/**
 * Where sing() would put each syllable of `lyrics` on `notes`, for showing: each note's syllable,
 * and each line's notes and what had to be done to fit it. describeFit() says it in a sentence.
 */
export function fitLyrics(notes: NoteIn[], lyrics: string, lang: Lang = "en"): LyricFit {
  return planLyrics(notes, lyrics, LANGS[lang]).fit;
}

const ipaOf = (s: Syl): string =>
  (s.stress === 1 ? "ˈ" : s.stress === 2 ? "ˌ" : "") + [...s.onset, ...s.nucleus, ...s.coda].map((g) => g.ph + (g.long ? "ː" : "")).join("");

/** A text as IPA: syllables parted by dots, stress marked, words by spaces, pauses by " | ". */
export function transcribe(text: string, lang: Lang = "en", style: Style = "speech"): string {
  return words(text, lang, style)
    .map((t) => (t.kind === "word" ? t.word.syls.map(ipaOf).join(".") : "|"))
    .join(" ");
}

export { importSong, type SongImport, type SongTrack } from "./song.ts";
export { acappella, type Part } from "./acappella.ts";
export { describeFit, type LineFit, type LineHow, type LyricFit, type NoteFit, type NoteFitKind } from "./fit.ts";
