// The computer keyboard as a piano: the home row is the white keys, the row above the black ones,
// the way a piano's keys sit. Keys are named by position (KeyboardEvent.code), so it is the same
// shape on every layout.

/** Semitones above the keyboard's lowest note, by key. */
export const PIANO_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

/** Keys that move the keyboard an octave down or up. */
export const OCTAVE_KEYS: Record<string, number> = { KeyZ: -1, KeyX: 1 };

export const OCTAVE_RANGE = 2;

/** The MIDI note a key plays, or null if it is not a piano key. */
export function keyNote(code: string, base: number, octave: number): number | null {
  const step = PIANO_KEYS[code];
  return step === undefined ? null : base + 12 * octave + step;
}
