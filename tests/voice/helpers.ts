// Shared by the voice's tests and tools: hold a pose, perform a line, measure the result.
import { BODIES, POSE_KEYS, REST } from "../../src/contract.ts";
import type { Body, Pose, Score } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { newAirway, shapeAirway } from "../../src/voice/shape.ts";
import { resonances } from "../../src/voice/theory.ts";
import { renderScore, scoreOf } from "../../tools/voice-score.ts";
import { formantsOf } from "./measure.ts";

export const RATE = 48000;

/** A sung pose: the rest pose with the nose shut, the folds together and a singing breath, plus `pose`. */
export function sung(pose: Partial<Pose>): Pose {
  return { ...REST, velum: 0, glottis: 0.5, lungs: 0.6, ...pose };
}

/** Aim a fresh voice at a pose and render `seconds` of it. */
export function hold(pose: Partial<Pose>, body: Body, seconds = 0.7, rate = RATE): Float32Array {
  const voice = createVoice(rate, body);
  voice.aim(pose);
  const sound = new Float32Array(Math.round(seconds * rate));
  voice.render(sound);
  return sound;
}

/** Perform a line of hand-written phones (see tools/voice-score.ts) from silence. */
export function say(line: string, body: Body = BODIES.tenor, rate = RATE): { sound: Float32Array; score: Score } {
  const score = scoreOf(line, { body });
  return { sound: renderScore(score, body, rate), score };
}

const airway = newAirway();
const array = new Float64Array(POSE_KEYS.length);

/** The tube a pose makes for a body (the areas are reused by the next call). */
export function tubeOf(pose: Pose, body: Body) {
  POSE_KEYS.forEach((k, i) => (array[i] = pose[k]));
  shapeAirway(array, body, airway);
  return airway;
}

/**
 * The first three formants of a pose as a listener would measure them: render it with the real
 * engine at three low pitches, find the resonances by linear prediction, and take the middle
 * value of each. A low pitch is used whatever the body, because harmonics far apart hide where
 * the resonances are; the resonances belong to the tube, not the pitch.
 */
export function heardFormants(pose: Pose, body: Body): number[] {
  const tube = tubeOf(pose, body);
  const expected = resonances(tube.area, tube.length, 3);
  const ceiling = 5000 * (17.5 / body.tract);
  const got: number[][] = [[], [], []];
  for (const pitch of [97, 110, 124]) {
    const sound = hold({ ...pose, pitch }, body, 0.7);
    const peaks = formantsOf(sound, RATE, RATE * 0.3, RATE * 0.68, ceiling).filter((p) => p.wide < 450);
    for (let i = 0; i < 3; i++) {
      // The peak nearest (in pitch) to where the tube alone says this formant should be.
      let near = NaN;
      for (const p of peaks) if (!(Math.abs(Math.log(p.hz / expected[i])) > Math.abs(Math.log(near / expected[i])))) near = p.hz;
      if (near > 0 && Math.abs(Math.log(near / expected[i])) < 0.25) got[i].push(near);
    }
  }
  return got.map((list, i) => (list.length ? list.sort((a, b) => a - b)[list.length >> 1] : expected[i]));
}

/** Level in dB (re full scale) of the sound between two times in seconds. */
export function levelAt(sound: ArrayLike<number>, from: number, to: number, rate = RATE): number {
  let sum = 0;
  const a = Math.max(0, Math.round(from * rate));
  const b = Math.min(sound.length, Math.round(to * rate));
  for (let i = a; i < b; i++) sum += sound[i] * sound[i];
  return 10 * Math.log10(sum / Math.max(1, b - a) + 1e-12);
}

/**
 * The first time from `from` on when the level of the next `window` seconds rises past `db`
 * (or, with `falling`, drops under it). NaN if it never does before `to`.
 */
export function crossing(sound: ArrayLike<number>, from: number, to: number, db: number, falling = false, window = 0.005, rate = RATE): number {
  for (let t = from; t < to; t += 0.001) {
    const level = levelAt(sound, t, t + window, rate);
    if (falling ? level < db : level > db) return t;
  }
  return NaN;
}
