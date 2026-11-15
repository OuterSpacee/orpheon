// The body control: one number from child (0) to bass (4), whole numbers being the named bodies
// of the contract, anything between a body between them.
import { BODIES } from "../contract.ts";
import type { Body } from "../contract.ts";
import { clamp, midiToHz } from "./notes.ts";

export const BODY_NAMES = Object.keys(BODIES) as (keyof typeof BODIES)[];
export const BODY_MAX = BODY_NAMES.length - 1;

/**
 * Where each named body speaks and sings most easily, as MIDI notes. Speaking pitch: about
 * 290 Hz for a young child, 210 Hz for a woman, 120 Hz for a man (Titze, "Principles of Voice
 * Production", 1994, ch. 8); the singing centres are the middles of the usual choir ranges.
 */
const SPEAKS = [62, 57, 54.5, 47, 42.5];
const SINGS = [72, 69, 64, 57, 48];

function between(table: readonly number[], body: number): number {
  const x = clamp(body, 0, BODY_MAX);
  const i = Math.min(BODY_MAX - 1, Math.floor(x));
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/** The body at a point on the scale. */
export function bodyAt(body: number): Body {
  return {
    tract: between(BODY_NAMES.map((n) => BODIES[n].tract), body),
    folds: between(BODY_NAMES.map((n) => BODIES[n].folds), body),
  };
}

/** The body at a point on the scale, its airway `size` times its own length (a giant, a tiny). */
export function sizedBody(body: number, size = 1): Body {
  const b = bodyAt(body);
  return size === 1 ? b : { tract: b.tract * size, folds: b.folds };
}

/** "tenor", or "between alto and tenor". */
export function bodyName(body: number): string {
  const x = clamp(body, 0, BODY_MAX);
  const near = Math.round(x);
  if (Math.abs(x - near) < 0.13) return BODY_NAMES[near];
  return `between ${BODY_NAMES[Math.floor(x)]} and ${BODY_NAMES[Math.ceil(x)]}`;
}

/** The pitch this body speaks at when nothing moves it, in Hz. */
export const speakingHz = (body: number): number => midiToHz(between(SPEAKS, body));

/** The pitch the voice will speak around, in Hz: the body's own, moved by the pitch control. */
export const spokenHz = (body: number, semitones: number): number => speakingHz(body) * 2 ** (semitones / 12);

/** The middle of this body's singing range, as a MIDI note. */
export const singingCentre = (body: number): number => between(SINGS, body);

/** The C the computer keyboard's lowest key plays for this body. */
export const keyboardBase = (body: number): number => 12 * Math.round((singingCentre(body) - 8) / 12);

/** Whole octaves to move a tune so that its middle sits where this body sings most easily. */
export function octavesToFit(lowest: number, highest: number, body: number): number {
  return 12 * Math.round((singingCentre(body) - (lowest + highest) / 2) / 12);
}
