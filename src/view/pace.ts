// Keeping to sixty frames a second on whatever machine this is: watch how long frames take and
// give up dust and sharpness, a step at a time, until they fit; take them back when there is
// room to spare.

/** The steps, best first: the share of the particles drawn, and the share of the pixels. */
const STEPS = [
  [1, 1], [0.78, 1], [0.78, 0.8], [0.6, 0.8], [0.6, 0.64], [0.45, 0.64], [0.45, 0.5], [0.33, 0.42],
] as const;
/** Frames between decisions. */
const WATCH = 40;

export interface Pace {
  /** Share of each part's particles to draw, 0..1. */
  density: number;
  /** Share of the pixel budget to use, 0..1. */
  pixels: number;
  /** A recent frame's length in ms. */
  frame: number;
  step: number;
  /** Tell it how long the last frame took. */
  saw(ms: number): void;
  /** Fix the step (the lab uses this to compare them); -1 lets it choose again. */
  pin(step: number): void;
}

export function makePace(): Pace {
  let sum = 0;
  let seen = 0;
  let calm = 0;
  let ceiling = 0;
  let wait = 0;
  let sinceUp = 99;
  let pinned = false;
  const p: Pace = {
    density: 1, pixels: 1, frame: 16.7, step: 0,
    saw(ms) {
      // A frame this long is a hidden tab or a stall, not the card.
      if (ms > 120) return;
      sum += ms;
      if (++seen < WATCH) return;
      p.frame = sum / seen;
      sum = 0;
      seen = 0;
      if (pinned) return;
      if (wait > 0 && --wait === 0) ceiling = 0;
      sinceUp++;
      if (p.frame > 19.5) {
        // Too slow for sixty: step down. If the step up was only just taken, it was one too many:
        // don't try it again for half a minute.
        if (sinceUp <= 3) {
          ceiling = p.step + 1;
          wait = 45;
        }
        go(p.step + 1);
        calm = 0;
      } else if (p.frame < 17.4) {
        if (++calm >= 6 && p.step > ceiling) {
          go(p.step - 1);
          calm = 0;
          sinceUp = 0;
        }
      } else calm = 0;
    },
    pin(step) {
      pinned = step >= 0;
      if (pinned) go(step);
    },
  };
  function go(step: number): void {
    p.step = Math.max(0, Math.min(STEPS.length - 1, step));
    p.density = STEPS[p.step][0];
    p.pixels = STEPS[p.step][1];
  }
  return p;
}
