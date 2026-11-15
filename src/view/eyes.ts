// The eyes' own life: they blink and they glance about, as a person's do while singing.
//
// A spontaneous blink comes every three to four seconds on average and lasts about a third of a
// second: the lid falls fast (some 75 ms), rests shut a moment, and rises more slowly (about 200 ms);
// now and then two come together. Between blinks the eyes make small quick jumps (saccades) and
// hold still for a second or more. (Stern, Walrath & Goldstein 1984; Doane 1980; Bahill et al. 1975.)
import { seeded } from "./curve.ts";

/** How long the lid takes to fall, stays shut, and takes to rise, in seconds. */
const FALL = 0.075;
const SHUT = 0.04;
const RISE = 0.2;
const BLINK = FALL + SHUT + RISE;
/** How far the eyes look about, in radians: to either side, and up and down. */
const TURN = 0.22;
const RAISE = 0.11;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** How closed the lids are `since` seconds into a blink: 0 open .. 1 shut. */
export function lidAt(since: number): number {
  if (since < 0 || since >= BLINK) return 0;
  if (since < FALL) return smooth(since / FALL);
  if (since < FALL + SHUT) return 1;
  return 1 - smooth((since - FALL - SHUT) / RISE);
}

export class Eyes {
  /** 0 open .. 1 shut, this frame. */
  closed = 0;
  /** Where they look now: a turn to the side and a raise, in radians. */
  turn = 0;
  raise = 0;
  private random: () => number;
  private time = 0;
  private blinkAt: number;
  private glanceAt: number;
  private aimTurn = 0;
  private aimRaise = 0;

  /** Each singer's eyes have their own seed, so a choir does not blink as one. */
  constructor(seed: number) {
    this.random = seeded(1009 + seed * 7919);
    this.blinkAt = 0.8 + this.random() * 3;
    this.glanceAt = 0.5 + this.random() * 2;
  }

  /** Move `dt` seconds on. `still` (reduced motion) keeps the eyes open and looking ahead. */
  step(dt: number, still: boolean): void {
    if (still) {
      this.closed = 0;
      this.turn = this.raise = 0;
      return;
    }
    this.time += dt;
    const r = this.random;
    if (this.time >= this.glanceAt) {
      // Back to straight ahead about half the time; otherwise somewhere near it.
      const home = r() < 0.45;
      const turn = home ? 0 : (r() * 2 - 1) * TURN;
      const raise = home ? 0 : (r() * 2 - 1) * RAISE;
      // A big jump of the eyes often brings a blink with it.
      if (Math.abs(turn - this.aimTurn) > TURN && r() < 0.35 && this.time > this.blinkAt - 1 && this.time < this.blinkAt) this.blinkAt = this.time;
      this.aimTurn = turn;
      this.aimRaise = raise;
      this.glanceAt = this.time + 0.7 + r() * 2.6;
    }
    // A saccade is over in a few tens of milliseconds.
    const k = 1 - Math.exp(-dt / 0.025);
    this.turn += (this.aimTurn - this.turn) * k;
    this.raise += (this.aimRaise - this.raise) * k;

    const since = this.time - this.blinkAt;
    this.closed = lidAt(since);
    if (since >= BLINK) {
      // The next: one in eight comes right after, the rest after 1.6 to 6 seconds, mostly sooner.
      this.blinkAt = r() < 0.12 ? this.time + 0.18 : this.time + 1.6 + 4.4 * Math.pow(r(), 1.6);
    }
  }
}
