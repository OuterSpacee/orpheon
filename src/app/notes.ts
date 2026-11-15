// Pitch arithmetic: MIDI note numbers, Hz, names.

/** MIDI 69 is the A above middle C, 440 Hz; twelve equal steps to the octave. */
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** "A3" for 57. Middle C (60) is C4. */
export function noteName(midi: number): string {
  const n = Math.round(midi);
  return NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

export const clamp = (x: number, low: number, high: number): number => Math.min(high, Math.max(low, x));
