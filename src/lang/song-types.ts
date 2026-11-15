/**
 * What the MIDI reader (midi.ts) reads from a file, and the single line a voice can sing
 * (melody.ts). Plain data. Carried over from our earlier Song Studio.
 *
 * Two clocks run side by side. `beat` / `beats` are quarter notes from the file's start (what a
 * piano roll draws); `time` / `duration` are seconds through the file's tempo map (what the
 * voice sings). A file with tempo changes has no single bpm, so everything downstream of the
 * importer sings from the seconds.
 */

export interface TempoPoint {
  /** quarter-note beats from the start */
  beat: number;
  /** seconds from the start */
  time: number;
  bpm: number;
}

export interface TimeSignature {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface TrackNote {
  /** MIDI note number (60 = middle C) */
  midi: number;
  beat: number;
  beats: number;
  time: number;
  duration: number;
  /** 1..127 */
  velocity: number;
}

/** A lyric or text event as the file wrote it (karaoke marks such as "\" and "/" still in it). */
export interface TimedLyric {
  beat: number;
  time: number;
  text: string;
}

export interface ImportedTrack {
  /** the track's place in the file */
  index: number;
  name: string;
  /** the channel most of its notes are on (0..15), or null with no notes */
  channel: number | null;
  /** General MIDI program of that channel at its first note, or null if none was set */
  program: number | null;
  /** channel 10 (index 9): percussion, never a melody */
  drums: boolean;
  /** sorted by beat, then by midi */
  notes: TrackNote[];
  /** lyric events in this track, in order */
  lyrics: TimedLyric[];
}

export interface ImportedSong {
  title: string | null;
  format: "midi" | "musicxml";
  /** always at least one point, at beat 0 (120 bpm when the file sets none) */
  tempos: TempoPoint[];
  timeSignatures: TimeSignature[];
  tracks: ImportedTrack[];
  /** seconds to the end of the last note */
  duration: number;
  /** what the importer skipped or guessed, in plain words for the person who dropped the file */
  warnings: string[];
}

/** One note of a single-voice line: no two overlap, sorted by time. A rest is the gap between two. */
export interface MelodyNote {
  midi: number;
  beat: number;
  beats: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface Melody {
  /** the track it came from */
  track: number;
  notes: MelodyNote[];
}

