// What the page tells the audio thread. One message does one thing to one seat (0..5).
//
// The audio thread answers with nothing but packets (see packet.ts): a Float32Array, transferred.
// The page copies it and posts the same array straight back, so the buffers are recycled.
import type { BandNote, Body, InstrumentId, Pose, Score } from "../../contract.ts";

export type ToVoices =
  /** Seat a new voice. `level` 0..1; `place` -1 far left to +1 far right. */
  | { type: "add"; seat: number; body: Body; level: number; place: number }
  /** Fade a voice out and free its seat. */
  | { type: "remove"; seat: number }
  | { type: "body"; seat: number; body: Body }
  | { type: "mix"; seat: number; level: number; place: number }
  /** Live control: Voice.aim. */
  | { type: "aim"; seat: number; pose: Partial<Pose> }
  /**
   * Voice.perform. `when` is on the audio context's clock (0 or the past: now), so several seats
   * given the same `when` start together. `take` is any number the page likes; the packet echoes
   * it, so the page knows from which packet on the start time is this performance's.
   */
  | { type: "perform"; seat: number; score: Score; when: number; take: number }
  /** Voice.hush. */
  | { type: "hush"; seat: number }
  /** Seat an instrument in the band (slot 0..7), with its level and place. */
  | { type: "instrument"; slot: number; id: InstrumentId; level: number; place: number }
  /** Fade an instrument out and free its slot. */
  | { type: "unseat"; slot: number }
  | { type: "bandmix"; slot: number; level: number; place: number }
  /** Instrument.perform, timed as "perform" is: the same `when` starts on the same sample. */
  | { type: "play"; slot: number; notes: BandNote[]; when: number }
  /** Instrument.strike: one note now, for playing live. */
  | { type: "strike"; slot: number; midi: number; velocity: number }
  | { type: "bandhush"; slot: number }
  /** The whole band's level, 0..1. */
  | { type: "bandlevel"; level: number };

/**
 * Asking the engine how it forms each vowel: the worker performs each one alone and answers with
 * the pose the voice reports in the middle of it (POSE_COUNT floats for each, in pose order).
 */
export interface VowelJob {
  vowels: Score[];
}

/** What the offline render worker is asked for, and what it answers. */
export interface RenderJob {
  sampleRate: number;
  /** Seconds to keep rendering after the longest score ends, so the last sound dies away. */
  tail: number;
  parts: { body: Body; score: Score; level: number; place: number }[];
  /** The instruments that play with them, and the band's level as a whole. */
  band?: { instrument: InstrumentId; notes: BandNote[]; level: number; place: number }[];
  bandLevel?: number;
}

export type FromRender =
  | { type: "progress"; done: number }
  | { type: "done"; left: Float32Array; right: Float32Array }
  | { type: "vowels"; poses: Float32Array }
  | { type: "failed"; why: string };
