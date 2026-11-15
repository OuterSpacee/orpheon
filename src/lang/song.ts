/**
 * A MIDI or karaoke file's bytes to what sing() takes: the tune as notes, and the file's words
 * (if it has any) laid on those notes, written in sing()'s lyric syntax so a person can read
 * and correct them.
 *
 * Reading the file is midi.ts; choosing the tune is melody.ts (both carried over from our
 * earlier Song Studio). Here the file's lyric events go onto the tune's notes:
 *   - each lyric event belongs to the first unclaimed note starting within LYRIC_SLACK of it,
 *     or failing that the next unclaimed note after it;
 *   - two events on one note are sung on it together ("fi~re");
 *   - a note no event claims, close after a sung one, holds that syllable ("_"); one after a
 *     long silence is the instrument playing alone, and is not sung;
 *   - karaoke text keeps its own word breaks: a space ends a word, a "-" at the end of an event
 *     or no space means the word goes on, "\" and "/" (new paragraph, new line) start one.
 * Every time is moved later by the same `offset`, so that the first note leaves room for its
 * consonants and a breath; use the same offset for anything played with the song.
 */
import type { NoteIn } from "./index.ts";
import { type Lang, LANGS } from "./langs.ts";
import { extractMelody, rankMelodyTracks } from "./melody.ts";
import { parseMidi } from "./midi.ts";
import type { ImportedSong, MelodyNote, TempoPoint, TimedLyric, TimeSignature } from "./song-types.ts";

export interface SongTrack {
  index: number;
  name: string;
  /** how many notes it has */
  notes: number;
  drums: boolean;
  /** General MIDI program, or null */
  program: number | null;
  /** lowest and highest MIDI note, or null with no notes */
  low: number | null;
  high: number | null;
  /** how likely it is the tune, best first in `ranking`; null for drums and empty tracks */
  melodyScore: number | null;
  /** why, in plain words */
  why: string;
}

export interface SongImport {
  title: string | null;
  /** beats a minute at the start */
  tempo: number;
  tempos: TempoPoint[];
  timeSignatures: TimeSignature[];
  tracks: SongTrack[];
  /** the track the tune is taken from, or null when nothing can be sung */
  melodyTrack: number | null;
  /** the tune, one note at a time, `offset` already added */
  notes: NoteIn[];
  /** the file's words on those notes, in sing()'s syntax; "" when the file has none */
  lyrics: string;
  /** seconds added to every time in the file */
  offset: number;
  /** seconds to the end of the last note, `offset` included */
  duration: number;
  /** what was skipped or guessed, in plain words */
  warnings: string[];
  /** everything the reader found, on the file's own clock (no offset) */
  song: ImportedSong;
}

export interface ImportOptions {
  /** take the tune from this track instead of the best guess */
  track?: number;
  /** the earliest a note may start, in seconds (default 0.5) */
  lead?: number;
  /** the language of the words, to tell which words need "~" to stay on one note (default en) */
  lang?: Lang;
}

/** how far a lyric event may be from its note's start */
const LYRIC_SLACK = 0.25;
/** a note with no lyric after a sung note is held when it starts within this of it ending */
const HOLD_GAP = 0.3;

interface Piece {
  text: string;
  /** a new word starts with this piece */
  wordStart: boolean;
}

/** Karaoke event text to a piece of a word; null when it has no letters. */
function readEvents(lyrics: TimedLyric[]): { time: number; text: string; startsWord: boolean; endsWord: boolean }[] {
  const out: { time: number; text: string; startsWord: boolean; endsWord: boolean }[] = [];
  for (const l of lyrics) {
    const raw = l.text.replace(/[\r\n]/g, "/");
    const startsWord = /^[\s\\/]/.test(raw) || out.length === 0;
    const endsWord = /\s$/.test(raw) || /[.,;:!?]$/.test(raw.trim());
    const continues = /-\s*$/.test(raw);
    const text = raw.replace(/[\\/]/g, "").replace(/-\s*$/, "").trim();
    if (!/[\p{L}\p{N}]/u.test(text)) {
      if (out.length && (endsWord || startsWord || /\s/.test(raw))) out[out.length - 1].endsWord = true;
      continue;
    }
    if (startsWord && out.length) out[out.length - 1].endsWord = true;
    out.push({ time: l.time, text: text.replace(/\s+/g, "-"), startsWord, endsWord: endsWord && !continues });
  }
  return out;
}

/** The lyric events onto the tune: one piece per note (or "hold", or nothing to sing). */
export function lyricsOntoNotes(notes: MelodyNote[], lyrics: TimedLyric[]): { sung: boolean[]; text: string } {
  const events = readEvents(lyrics);
  const claimed: (Piece | null)[] = notes.map(() => null);
  /** the next note no event has claimed */
  let n = 0;
  /** the note the last event claimed */
  let last = -1;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e];
    const startsWord = ev.startsWord || e === 0 || events[e - 1].endsWord;
    while (n < notes.length && notes[n].time < ev.time - LYRIC_SLACK) n++;
    const nextIsNear = n < notes.length && notes[n].time <= ev.time + LYRIC_SLACK;
    const lastIsNear = last >= 0 && Math.abs(notes[last].time - ev.time) <= LYRIC_SLACK;
    if (!nextIsNear && (lastIsNear || n >= notes.length) && last >= 0) {
      // no note of its own: two events on one note are one syllable sung on it
      claimed[last]!.text += "~" + ev.text;
      continue;
    }
    if (n >= notes.length) continue;
    claimed[n] = { text: ev.text, wordStart: startsWord };
    last = n++;
  }

  // a note no lyric claims holds the syllable before it, or is not sung
  const sung = notes.map(() => false);
  const parts: string[] = [];
  let lastSung = -1;
  for (let i = 0; i < notes.length; i++) {
    const c = claimed[i];
    if (c) {
      parts.push(c.wordStart || parts.length === 0 ? " " + c.text : "-" + c.text);
      sung[i] = true;
      lastSung = i;
    } else if (lastSung >= 0 && notes[i].time - (notes[i - 1].time + notes[i - 1].duration) < HOLD_GAP && sung[i - 1]) {
      // inside a word the hold sits between its pieces: "Twin-_-kle"
      const nextClaim = claimed.slice(i + 1).find((x) => x !== null);
      const midWord = nextClaim && !nextClaim.wordStart;
      parts.push(midWord ? "-_" : " _");
      sung[i] = true;
    }
  }
  return { sung, text: parts.join("").trim() };
}

/** A word given one note that the language says has more syllables gets a "~" (fire~). */
function keepOnOneNote(text: string, lang: Lang): string {
  return text
    .split(" ")
    .map((w) => (w && !/[-_~]/.test(w) && LANGS[lang].word(w, "song").syls.length > 1 ? w + "~" : w))
    .join(" ");
}

/** Where the lyrics of a song are: on the tune's own track, or in a words track of their own. */
function lyricsFor(song: ImportedSong, track: number): TimedLyric[] {
  const own = song.tracks[track]?.lyrics ?? [];
  if (own.length) return own;
  const loose = song.tracks.filter((t) => t.notes.length === 0).flatMap((t) => t.lyrics);
  if (loose.length) return loose.sort((a, b) => a.time - b.time);
  // lyrics in another track with notes (a file that put them with the piano): still the words
  return song.tracks.flatMap((t) => t.lyrics).sort((a, b) => a.time - b.time);
}

/** A MIDI or karaoke file to the tune, its words, and what else is in it. Throws in plain words. */
export function importSong(bytes: Uint8Array, options: ImportOptions = {}): SongImport {
  const song = parseMidi(bytes);
  const ranking = rankMelodyTracks(song);
  const rank = new Map(ranking.map((r) => [r.track, r]));
  const warnings = [...song.warnings];
  let melodyTrack: number | null = options.track ?? ranking[0]?.track ?? null;
  if (melodyTrack !== null && (!song.tracks[melodyTrack] || song.tracks[melodyTrack].notes.length === 0)) {
    warnings.push(`Track ${melodyTrack + 1} has no notes to sing; the best guess is used instead.`);
    melodyTrack = ranking[0]?.track ?? null;
  }
  const earliest = song.tracks.reduce((m, t) => t.notes.reduce((mm, n) => Math.min(mm, n.time), m), Infinity);
  const offset = Number.isFinite(earliest) ? Math.max(0, (options.lead ?? 0.5) - earliest) : 0;

  let notes: NoteIn[] = [];
  let lyrics = "";
  if (melodyTrack !== null) {
    const line = extractMelody(song.tracks[melodyTrack]).notes;
    const timed = lyricsFor(song, melodyTrack);
    if (timed.length) {
      const fit = lyricsOntoNotes(line, timed);
      notes = line.filter((_, i) => fit.sung[i]).map((n) => ({ t: n.time + offset, d: n.duration, midi: n.midi }));
      lyrics = keepOnOneNote(fit.text, options.lang ?? "en");
      const unsung = fit.sung.filter((s) => !s).length;
      if (unsung) warnings.push(`${unsung} ${unsung === 1 ? "note" : "notes"} of the tune with no words ${unsung === 1 ? "is" : "are"} left for the instruments.`);
    } else notes = line.map((n) => ({ t: n.time + offset, d: n.duration, midi: n.midi }));
  } else warnings.push("Nothing in this file can be sung: it has no tune, only drums or silence.");

  const tracks: SongTrack[] = song.tracks.map((t) => {
    const pitches = t.notes.map((n) => n.midi);
    const r = rank.get(t.index);
    return {
      index: t.index,
      name: t.name,
      notes: t.notes.length,
      drums: t.drums,
      program: t.program,
      low: pitches.length ? Math.min(...pitches) : null,
      high: pitches.length ? Math.max(...pitches) : null,
      melodyScore: r ? r.score : null,
      why: r ? r.why : t.drums ? "drums" : "no notes",
    };
  });

  return {
    title: song.title,
    tempo: song.tempos[0]?.bpm ?? 120,
    tempos: song.tempos,
    timeSignatures: song.timeSignatures,
    tracks,
    melodyTrack,
    notes,
    lyrics,
    offset,
    duration: song.duration + offset,
    warnings,
    song,
  };
}
