// What every instrument shares: the schedule of notes, the render loop that keeps output the
// same for any block size, and a few small filters.
//
// Notes become events at whole sample numbers. render() walks the block in runs that end at the
// next event or the next point of the control grid (every CONTROL samples, counted from the
// instrument's first sample, not from the block), so the same events land on the same samples
// and slow changes happen on the same samples however the page cuts its blocks.
import type { BandNote, Instrument } from "../contract.ts";

/** Samples between two control updates (slow changes: envelopes' targets, vibrato, sleeping voices). */
export const CONTROL = 32;

/** Seeded white noise, uniform in -1..1 (xorshift32; Marsaglia 2003). */
export class Noise {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0 || 0x2545f491;
  }
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s;
    return s * 4.656612873077393e-10;
  }
}

export const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Phase delay, in samples, of the one-pole lowpass (1-p)/(1 - p z^-1) at w radians a sample. */
export function lowpassDelay(p: number, w: number): number {
  return Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w;
}

/** Gain of the same lowpass at w. */
export function lowpassGain(p: number, w: number): number {
  return (1 - p) / Math.sqrt(1 - 2 * p * Math.cos(w) + p * p);
}

/**
 * The coefficient of a first-order allpass (C + z^-1)/(1 + C z^-1) whose phase delay at w is
 * exactly `delay` samples (0 < delay·w < π). Its phase is −2·atan(((1−C)/(1+C))·tan(w/2)).
 */
export function allpassFor(delay: number, w: number): number {
  const k = Math.tan((w * delay) / 2) / Math.tan(w / 2);
  return (1 - k) / (1 + k);
}

/**
 * A resonance: a two-pole bandpass at f Hz with quality q (the "constant peak gain" form of the
 * RBJ cookbook biquad). Used for instrument bodies.
 */
export class Resonator {
  private b0 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(sampleRate: number, f: number, q: number, readonly gain: number) {
    const w = (2 * Math.PI * Math.min(f, 0.45 * sampleRate)) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  step(x: number): number {
    const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y * this.gain;
  }
  clear(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

/** Removes the steady part of a signal (a one-zero, one-pole highpass near 20 Hz). */
export class DcBlock {
  private x1 = 0;
  private y1 = 0;
  private r: number;
  constructor(sampleRate: number, corner = 20) {
    this.r = Math.exp((-2 * Math.PI * corner) / sampleRate);
  }
  step(x: number): number {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** How loud: the rms of what an instrument made, over about 50 ms, scaled so a played note reads near 1. */
export class Meter {
  private sum = 0;
  private k: number;
  constructor(sampleRate: number, private readonly full: number) {
    this.k = 1 - Math.exp(-1 / (0.05 * sampleRate));
  }
  push(x: number): void {
    this.sum += this.k * (x * x - this.sum);
  }
  get level(): number {
    const v = Math.sqrt(this.sum) / this.full;
    return v > 1 ? 1 : v;
  }
}

/**
 * The part of an instrument every model shares. A subclass says what a note does (start, stop),
 * how its voices sound for a run of samples, and what changes slowly.
 */
export abstract class Player implements Instrument {
  readonly sampleRate: number;
  /** samples rendered so far */
  protected now = 0;
  private meter: Meter;

  // the schedule, in time order: start/stop events at whole samples
  private evAt = new Float64Array(64);
  private evMidi = new Float64Array(64);
  private evVelocity = new Float64Array(64);
  /** for a stop, the sample its note started; for a start, -1 */
  private evBegan = new Float64Array(64);
  private evCount = 0;
  private evNext = 0;

  // live strikes, applied at the start of the next render
  private liveMidi = new Float64Array(32);
  private liveVelocity = new Float64Array(32);
  private live = 0;

  // what the drawing shows
  protected lastMidi = 0;
  protected lastAt = -1;

  constructor(sampleRate: number, fullLevel: number) {
    this.sampleRate = sampleRate;
    this.meter = new Meter(sampleRate, fullLevel);
  }

  get time(): number {
    return this.now / this.sampleRate;
  }

  /** Start a note now. */
  protected abstract start(midi: number, velocity: number): void;
  /** Let a note go now (the player lifts the finger, the bow, the breath; a drum ignores it). */
  protected abstract stop(midi: number): void;
  /** Add `count` samples of every sounding voice into out[from..]. */
  protected abstract play(out: Float32Array, from: number, count: number): void;
  /** Slow changes, once every CONTROL samples. */
  protected abstract control(): void;
  /** Silence every voice at once (hush). */
  protected abstract silence(): void;
  /** What happens to the summed voices on the way out (a body, a soundboard), sample by sample. */
  protected finish(x: number): number {
    return x;
  }
  /** The drawing's part of sense(), after the five shared values. */
  protected abstract shape(into: Float32Array): void;
  /** How many voices are sounding. */
  protected abstract sounding(): number;
  /** 1 string, 2 bowed string, 3 piano, 4 pipe, 5 membrane. */
  protected abstract readonly family: number;

  perform(notes: BandNote[], at: number = this.time): void {
    const from = Math.round(at * this.sampleRate);
    // keep what is due before `from`, and the stops of notes already begun
    let kept = 0;
    for (let i = this.evNext; i < this.evCount; i++) {
      const isStop = this.evBegan[i] >= 0;
      if (this.evAt[i] < from || (isStop && this.evBegan[i] < from)) {
        this.evAt[kept] = this.evAt[i];
        this.evMidi[kept] = this.evMidi[i];
        this.evVelocity[kept] = this.evVelocity[i];
        this.evBegan[kept] = this.evBegan[i];
        kept++;
      }
    }
    const events: { at: number; midi: number; velocity: number; began: number }[] = [];
    for (let i = 0; i < kept; i++) events.push({ at: this.evAt[i], midi: this.evMidi[i], velocity: this.evVelocity[i], began: this.evBegan[i] });
    for (const n of notes) {
      if (!Number.isFinite(n.t) || !Number.isFinite(n.d) || !Number.isFinite(n.midi) || !Number.isFinite(n.velocity)) continue;
      const on = Math.max(from, Math.round((at + n.t) * this.sampleRate));
      const off = Math.max(on + 1, Math.round((at + n.t + Math.max(0, n.d)) * this.sampleRate));
      const velocity = Math.max(0, Math.min(1, n.velocity));
      if (velocity <= 0) continue;
      events.push({ at: on, midi: n.midi, velocity, began: -1 });
      events.push({ at: off, midi: n.midi, velocity: 0, began: on });
    }
    // in time order; at one sample, stops before starts (a repeated note is let go, then struck)
    events.sort((a, b) => a.at - b.at || (b.began >= 0 ? 1 : 0) - (a.began >= 0 ? 1 : 0));
    if (events.length > this.evAt.length) {
      const size = 2 * events.length;
      this.evAt = new Float64Array(size);
      this.evMidi = new Float64Array(size);
      this.evVelocity = new Float64Array(size);
      this.evBegan = new Float64Array(size);
    }
    events.forEach((e, i) => {
      this.evAt[i] = e.at;
      this.evMidi[i] = e.midi;
      this.evVelocity[i] = e.velocity;
      this.evBegan[i] = e.began;
    });
    this.evCount = events.length;
    this.evNext = 0;
  }

  strike(midi: number, velocity: number): void {
    if (this.live >= this.liveMidi.length || !Number.isFinite(midi) || !Number.isFinite(velocity)) return;
    this.liveMidi[this.live] = midi;
    this.liveVelocity[this.live] = Math.max(0, Math.min(1, velocity));
    this.live++;
  }

  hush(): void {
    this.evCount = 0;
    this.evNext = 0;
    this.live = 0;
    this.silence();
  }

  render(out: Float32Array): void {
    const n = out.length;
    out.fill(0);
    for (let k = 0; k < this.live; k++) {
      if (this.liveVelocity[k] > 0) this.launch(this.liveMidi[k], this.liveVelocity[k]);
      else this.stop(this.liveMidi[k]);
    }
    this.live = 0;
    let i = 0;
    while (i < n) {
      if (this.now % CONTROL === 0) this.control();
      while (this.evNext < this.evCount && this.evAt[this.evNext] <= this.now) {
        const e = this.evNext++;
        if (this.evBegan[e] >= 0) this.stop(this.evMidi[e]);
        else this.launch(this.evMidi[e], this.evVelocity[e]);
      }
      let run = CONTROL - (this.now % CONTROL);
      if (run > n - i) run = n - i;
      if (this.evNext < this.evCount && this.evAt[this.evNext] - this.now < run) run = this.evAt[this.evNext] - this.now;
      this.play(out, i, run);
      i += run;
      this.now += run;
    }
    for (let k = 0; k < n; k++) {
      let x = this.finish(out[k]);
      // never more than full scale, rounded off rather than clipped; never a NaN out
      if (!(x > -10 && x < 10)) x = 0;
      const big = x < 0 ? -x : x;
      if (big > 0.8) x = (x < 0 ? -1 : 1) * (0.8 + 0.2 * Math.tanh((big - 0.8) / 0.2));
      out[k] = x;
      this.meter.push(x);
    }
  }

  private launch(midi: number, velocity: number): void {
    this.lastMidi = midi;
    this.lastAt = this.now;
    this.start(midi, velocity);
  }

  sense(into: Float32Array): void {
    into[0] = this.meter.level;
    into[1] = this.family;
    into[2] = this.lastMidi;
    into[3] = this.lastAt < 0 ? -1 : (this.now - this.lastAt) / this.sampleRate;
    into[4] = this.sounding();
    for (let i = 5; i < into.length && i < 64; i++) into[i] = 0;
    this.shape(into);
  }
}

/** Pick a voice for a new note: one free, else the quietest. `levels` and `busy` are per voice. */
export function choose(busy: ArrayLike<boolean>, loudness: ArrayLike<number>): number {
  let quiet = 0;
  for (let i = 0; i < busy.length; i++) {
    if (!busy[i]) return i;
    if (loudness[i] < loudness[quiet]) quiet = i;
  }
  return quiet;
}

/**
 * The displacement of a string from the contents of its loop (the wave as it passes the bridge,
 * over one round trip): at a point x along the string it is the wave arriving there minus its
 * mirror image coming back (a fixed end reflects it inverted). Writes 32 points, bridge to nut,
 * normalised to the largest.
 */
export function stringShape(buf: Float32Array, read: number, length: number, size: number, into: Float32Array, at: number): void {
  let peak = 1e-9;
  const half = length / 2;
  for (let k = 0; k < 32; k++) {
    const j = Math.round((k / 31) * half);
    let a = read + j;
    let b = read + length - j;
    while (a >= size) a -= size;
    while (b >= size) b -= size;
    const y = buf[a] - buf[b];
    into[at + k] = y;
    if ((y < 0 ? -y : y) > peak) peak = y < 0 ? -y : y;
  }
  for (let k = 0; k < 32; k++) into[at + k] /= peak;
}


/**
 * Up to 12 sounding notes as (midi, loudness 0..1) pairs at 40..63, loudest first; `midis` is -1
 * for a silent voice. Picks by repeated search, so nothing is allocated.
 */
export function writeNotes(into: Float32Array, midis: Float64Array, energies: Float64Array, full: number): void {
  let ceiling = Infinity;
  let ceilingIndex = -1;
  for (let k = 0; k < 12; k++) {
    let best = -1;
    for (let i = 0; i < midis.length; i++) {
      if (midis[i] < 0) continue;
      const e = energies[i];
      // the next loudest after the last one taken (ties broken by index)
      if (e > ceiling || (e === ceiling && i <= ceilingIndex)) continue;
      if (best < 0 || e > energies[best]) best = i;
    }
    into[40 + 2 * k] = best < 0 ? 0 : midis[best];
    into[41 + 2 * k] = best < 0 ? 0 : Math.min(1, Math.sqrt(energies[best] / full));
    if (best >= 0) {
      ceiling = energies[best];
      ceilingIndex = best;
    } else ceiling = -Infinity;
  }
}
