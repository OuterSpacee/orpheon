// How each song is to be performed: alone or as a choir, with a band or without, and what the
// person changed about each singer. Kept for every song apart, so ticking the choir on for one
// song leaves the others as they were. No DOM here.
import { INSTRUMENTS } from "../../contract.ts";
import type { InstrumentId } from "../../contract.ts";
import type { SongTrack } from "../../lang/song.ts";
import { songById } from "../songs.ts";
import type { Prefer } from "../../lang/critic.ts";

export type Style = "staged" | "hymn" | "oohs" | "round";
export const STYLES: { id: Style; name: string }[] = [
  { id: "staged", name: "Staged" },
  { id: "hymn", name: "Hymn" },
  { id: "oohs", name: "Oohs" },
  { id: "round", name: "Round" },
];

/** What a track of an imported file does: sung by a head of its own, played by an instrument, or left out. */
export type TrackUse = "sing" | "play" | "out";

export interface SongSetup {
  /** Several heads, each singing a part, or one head singing the tune. */
  choir: boolean;
  /** How many sung parts the arranger makes, 2..6. */
  voices: number;
  style: Style;
  /** The band plays. */
  band: boolean;
  /** The instruments ticked; null is what the arranger suggests for this tune. */
  instruments: InstrumentId[] | null;
  /** An imported file's tracks by index; a track left out here does what its default says. */
  tracks: Readonly<Record<number, TrackUse>>;
  /** Staged: which of the critic's plans, the best first (0, or left out); "Try another" counts up. */
  variant?: number;
  /** Staged: what the AI arranger advised for this file's plan; the critic weighs it. */
  prefer?: Prefer;
  /** Why the ticked instruments are these, when someone other than the page chose them (the AI arranger). */
  bandWhy?: string;
}

/** What the person changed about one singer. Anything left out is the arrangement's. */
export interface SeatChange {
  /** 0 child .. 4 bass. */
  body?: number;
  /** Whole octaves up or down. */
  octave?: number;
  level?: number;
  place?: number;
  mute?: boolean;
  solo?: boolean;
}

/** A song as it starts: a song written for a choir sings as one, every other alone; no band, unless the song has its own. */
export function defaultSetup(song: string): SongSetup {
  const known = songById(song);
  return { choir: !!known?.voices?.length, voices: 4, style: "staged", band: !!known?.band, instruments: null, tracks: {} };
}

export function setupOf(s: { song: string; setups: Readonly<Record<string, Partial<SongSetup>>> }): SongSetup {
  return { ...defaultSetup(s.song), ...s.setups[s.song] };
}

/** The state patch that changes the current song's setup. */
export function setupPatch(
  s: { song: string; setups: Readonly<Record<string, Partial<SongSetup>>> },
  patch: Partial<SongSetup>,
): { setups: Record<string, Partial<SongSetup>> } {
  return { setups: { ...s.setups, [s.song]: { ...s.setups[s.song], ...patch } } };
}

/** What a track does unless the person said: sung while the choir is on, else played while the band is, else nothing. */
export function trackUse(setup: SongSetup, track: number): TrackUse {
  return setup.tracks[track] ?? (setup.choir ? "sing" : setup.band ? "play" : "out");
}

/**
 * The instrument that plays a file's track: from its General MIDI program's family (General
 * MIDI 1 sound set: 0 pianos, 24 guitars, 32 basses, 40 strings, 46 the harp, 72 pipes...).
 */
export function instrumentFor(track: Pick<SongTrack, "program" | "drums">): InstrumentId {
  if (track.drums) return "kit";
  const p = track.program;
  if (p === null) return "piano";
  if (p === 46 || (p >= 8 && p < 16) || p === 107) return "harp";
  if (p < 8) return "piano";
  if ((p >= 24 && p < 32) || (p >= 104 && p < 108)) return "guitar";
  if (p >= 32 && p < 40) return "bass";
  if (p === 47 || (p >= 112 && p < 120)) return "timpani";
  if ((p >= 64 && p < 88) || p === 111) return "flute";
  return "strings";
}

export const instrumentName = (id: InstrumentId): string => INSTRUMENTS.find((i) => i.id === id)?.name ?? id;
