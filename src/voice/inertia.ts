// Each part of the body has its own inertia. A pose value does not jump to where it is aimed: it
// moves like a mass on a critically damped spring (the task-dynamic picture of speech gestures,
// Saltzman & Munhall 1989), quickly for the tongue tip, slowly for the jaw.
import { POSE_COUNT, POSE_KEYS } from "../contract.ts";
import type { PoseKey } from "../contract.ts";

/**
 * Stiffness of each part, per second. A part covers half the distance to a new target in about
 * 1.7/rate seconds and nine tenths in 3.9/rate. The orders of magnitude follow the movement
 * times in Löfqvist & Gracco (1997, lips and jaw) and Kuehn & Moll (1976, tongue and velum).
 */
export const RATE: Record<PoseKey, number> = {
  lungs: 80,
  pitch: 90,
  glottis: 85,
  register: 30,
  larynx: 30,
  jaw: 38,
  tongueX: 45,
  tongueY: 45,
  tip: 110,
  tipX: 100,
  lips: 70,
  round: 50,
  velum: 60,
  lateral: 100,
  vibrato: 12,
};

const rates = Float64Array.from(POSE_KEYS, (k) => RATE[k]);

/**
 * Move `pose` and its `speed` toward `goal` over `h` seconds: the exact solution of
 * x'' = rate²·(goal − x) − 2·rate·x' for a goal that stays put over the step.
 */
export function ease(pose: Float64Array, speed: Float64Array, goal: Float64Array, h: number): void {
  for (let k = 0; k < POSE_COUNT; k++) {
    const rate = rates[k];
    const decay = Math.exp(-rate * h);
    const off = pose[k] - goal[k];
    const drift = speed[k] + rate * off;
    pose[k] = goal[k] + (off + drift * h) * decay;
    speed[k] = (speed[k] - rate * drift * h) * decay;
  }
}

/**
 * Time for a part starting at rest to cover `fraction` of the way to a new target, in seconds:
 * the inverse of 1 − (1 + rate·t)·exp(−rate·t).
 */
export function timeToCover(fraction: number, rate: number): number {
  const want = fraction < 0.001 ? 0.001 : fraction > 0.98 ? 0.98 : fraction;
  let lo = 0;
  let hi = 8;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (1 - (1 + mid) * Math.exp(-mid) < want) lo = mid;
    else hi = mid;
  }
  return (0.5 * (lo + hi)) / rate;
}
