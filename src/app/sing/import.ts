// Bringing in a song from a MIDI or karaoke file. The reading is the language layer's
// (importSong); this turns what it found, or why it could not, into what the Sing mode shows.
import { importSong } from "../../lang/index.ts";
import type { Lang, SongImport } from "../../lang/index.ts";
import type { Tune } from "../songs.ts";

export type Imported =
  | { ok: true; tune: Tune; /** What the reader skipped or guessed, in sentences. */ notes: string[] }
  /** This file is not one the page can use; `message` says why, in a sentence. */
  | { ok: false; message: string };

/** The kinds of file offered in the file picker. */
export const SONG_FILES = ".mid,.midi,.kar,audio/midi,audio/x-midi";

/** A Standard MIDI File begins with the four letters "MThd" (the MIDI 1.0 file specification). */
export function looksLikeMidi(bytes: Uint8Array): boolean {
  return bytes.length > 14 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
}

/** "My Song.kar" to "My Song". */
const bareName = (name: string): string => name.replace(/\.[a-z0-9]+$/i, "") || name;

/**
 * The tune of a file the reader has read, as a Tune: its notes counted from the first one. The
 * room before the first note is not lost: timed() puts LEAD_IN back in front of every tune,
 * built-in or imported, whatever the tempo. (The choir sings from `source`, which keeps the
 * reader's own offset.)
 */
export function tuneFrom(song: SongImport, name: string, lang: Lang): Tune | null {
  if (!song.notes.length) return null;
  const first = song.notes[0].t;
  return {
    title: song.title?.trim() || bareName(name),
    lang,
    notes: song.notes.map((n) => ({ t: n.t - first, d: n.d, midi: n.midi })),
    lyrics: song.lyrics,
    source: song,
  };
}

/** How many parts of a file besides the tune a choir could sing. */
export function otherParts(song: SongImport): number {
  return song.tracks.filter((t) => t.notes > 0 && t.index !== song.melodyTrack).length;
}

export async function readSongFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }, lang: Lang = "en"): Promise<Imported> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, message: `“${file.name}” could not be opened.` };
  }
  if (!bytes.length) return { ok: false, message: `“${file.name}” is empty.` };
  if (!looksLikeMidi(bytes)) return { ok: false, message: `“${file.name}” is not a MIDI or karaoke file.` };
  let song: SongImport;
  try {
    song = importSong(bytes, { lang });
  } catch (error) {
    // The reader throws in plain words; pass them on.
    const why = error instanceof Error && error.message ? error.message.replace(/[.\s]+$/, "") : "it is damaged";
    return { ok: false, message: `“${file.name}” could not be read: ${why}.` };
  }
  const tune = tuneFrom(song, file.name, lang);
  if (!tune) return { ok: false, message: `“${file.name}” has no tune in it that a voice could sing.` };
  return { ok: true, tune, notes: song.warnings };
}
