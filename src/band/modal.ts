// Modal synthesis: a note is a handful of exactly tuned partials, each a decaying complex phasor
// (Adrien 1991, "The missing link: modal synthesis"). Nothing random and no filters: every
// partial is a rotation by its own angle a sample, shrunk by its own decay, so the sound is as
// clean as the recipe that wrote it.
//
// A voice holds one sounding note. Voices are preallocated; a new note takes a free one, else the
// quietest is faded out over a few milliseconds and a spare takes the note (so a steal never
// clicks). A partial is dropped for good once it has fallen 70 dB below where it began (or is
// quieter than anything audible), and no
// partial above 0.45 of the sample rate is ever made, which is what keeps every instrument safe
// from 8 kHz to 192 kHz. Partials that never decay (a bowed string) are put back to their exact
// length on the control grid, so rounding can't make them grow.
import { CONTROL, hz, Player } from "./core.ts";

export { hz };

const MODES = 32;
/** where a partial stops being worth computing, as a share of where it began (70 dB down) */
const DEAD = Math.pow(10, -70 / 20);
/** and a partial this quiet (about -80 dB of full scale) is not worth computing whatever it began as */
const QUIET = 1e-4;
/** seconds a voice taken over by another note takes to fade out */
const STEAL_FADE = 0.008;
/** voices kept in reserve beyond the limit, for the ones fading out */
const SPARE = 4;
/** seconds for 60 dB, as the time constant of an exponential decay */
export const TAU60 = 1 / Math.log(1000);

/** sin(h·π·x) for harmonic h and the 32 points of a drawn string, so telemetry never calls sin */
const STRING_SIN = new Float64Array(33 * 32);
for (let h = 0; h <= 32; h++) for (let j = 0; j < 32; j++) STRING_SIN[h * 32 + j] = Math.sin((h * Math.PI * j) / 31);

/** One sounding note. */
export class Voice {
  // the partials
  readonly re = new Float64Array(MODES);
  readonly im = new Float64Array(MODES);
  /** the rotation by one sample, already shrunk by the decay: cos·d and sin·d */
  readonly c = new Float64Array(MODES);
  readonly s = new Float64Array(MODES);
  /** the decay over one control step */
  readonly step = new Float64Array(MODES);
  /** the current length of the phasor, tracked apart from re/im so it can be put back */
  readonly mag = new Float64Array(MODES);
  readonly floor = new Float64Array(MODES);
  readonly freq = new Float64Array(MODES);
  /** the harmonic number (strings) or the partial's place in the drum's list (drums) */
  readonly id = new Int32Array(MODES);
  readonly renorm = new Uint8Array(MODES);
  /** each drum partial's frequency by its id, kept after the partial has died, for the drawing */
  readonly byId = new Float64Array(MODES);
  n = 0;
  fmin = Infinity;

  active = false;
  midi = 0;
  velocity = 0;
  seq = 0;
  drum = 0;
  /** samples since the note began */
  age = 0;
  /** the sum of the partials' lengths now, and at the start of a note of velocity 1 */
  loud = 0;
  full = 1;
  // the envelope: a linear rise, then (from relAt) a linear fall; a steal adds a second, quick fall
  invRise = 1;
  relAt = Infinity;
  relLen = 1;
  invRel = 1;
  minRing = 0;
  stoppable = true;
  fastAt = Infinity;
  fastLen = 1;
  invFast = 1;

  constructor(readonly rate: number) {}

  clear(midi: number, velocity: number, seq: number): void {
    this.n = 0;
    this.fmin = Infinity;
    this.byId.fill(0);
    this.active = true;
    this.midi = midi;
    this.velocity = velocity;
    this.seq = seq;
    this.drum = 0;
    this.age = 0;
    this.relAt = Infinity;
    this.fastAt = Infinity;
    this.stoppable = true;
    this.minRing = 0;
  }

  /** Add a partial: frequency in Hz, starting length, seconds for it to fall by a factor e, id. */
  mode(f: number, a: number, tau: number, id: number): void {
    if (!(f > 0 && f < 0.45 * this.rate && tau > 0) || this.n >= MODES) return;
    const size = Math.abs(a);
    if (!(size > 1e-7)) return;
    const w = (2 * Math.PI * f) / this.rate;
    const d = Math.exp(-1 / (tau * this.rate));
    const m = this.n++;
    this.re[m] = 0;
    this.im[m] = a;
    this.c[m] = Math.cos(w) * d;
    this.s[m] = Math.sin(w) * d;
    this.step[m] = Math.exp(-CONTROL / (tau * this.rate));
    this.mag[m] = size;
    this.floor[m] = Math.max(size * DEAD, QUIET);
    this.freq[m] = f;
    this.id[m] = id;
    this.renorm[m] = tau > 4 ? 1 : 0;
    if (id < MODES) this.byId[id] = f;
    if (f < this.fmin) this.fmin = f;
  }

  /**
   * The note's envelope: it rises over `attack` seconds. A held note is let go by stop(): it
   * falls over `release` seconds, but not before `minRing` seconds have passed. A struck note
   * (`ring` finite) ignores stop() and falls over `release` seconds when `ring` is up.
   */
  envelope(attack: number, release: number, minRing: number, ring = Infinity): void {
    this.invRise = 1 / Math.max(1, attack * this.rate);
    this.relLen = Math.max(1, Math.round(release * this.rate));
    this.invRel = 1 / this.relLen;
    this.minRing = Math.round(minRing * this.rate);
    this.stoppable = ring === Infinity;
    this.relAt = ring === Infinity ? Infinity : Math.round(ring * this.rate);
  }

  /** Called once the recipe has added its partials. */
  seal(): void {
    let sum = 0;
    for (let m = 0; m < this.n; m++) sum += this.mag[m];
    this.loud = sum;
    this.full = this.velocity > 0 ? sum / this.velocity : sum;
    if (this.n === 0) this.active = false;
  }

  /** The note is let go now (a held note only). */
  release(): void {
    if (this.stoppable && this.relAt === Infinity) this.relAt = Math.max(this.age, this.minRing);
  }

  /** 0..1: how loud the note is now against how loud a note of its velocity began. */
  level(): number {
    const v = this.loud / (this.full > 0 ? this.full : 1);
    return v > 1 ? 1 : v;
  }
}

/** The part of a modal instrument that every one shares; a subclass writes the recipe of a note. */
export abstract class ModalPlayer extends Player {
  protected readonly voices: Voice[];
  private readonly limit: number;
  private readonly env = new Float64Array(CONTROL);
  private readonly acc = new Float64Array(CONTROL);
  private readonly picked: Uint8Array;
  private readonly stealSamples: number;
  private seq = 0;
  /** the voice struck last, for the drawing */
  protected recent = 0;

  constructor(sampleRate: number, fullLevel: number, limit: number) {
    super(sampleRate, fullLevel);
    this.limit = limit;
    this.voices = Array.from({ length: limit + SPARE }, () => new Voice(sampleRate));
    this.picked = new Uint8Array(limit + SPARE);
    this.stealSamples = Math.max(1, Math.round(STEAL_FADE * sampleRate));
  }

  /** Fill a cleared voice with the partials and envelope of a note. */
  protected abstract recipe(v: Voice, midi: number, velocity: number): void;

  protected start(midi: number, velocity: number): void {
    const k = this.take();
    const v = this.voices[k];
    v.clear(midi, velocity, ++this.seq);
    this.recipe(v, midi, velocity);
    v.seal();
    this.recent = k;
  }

  /** The oldest held note of this pitch lets go. */
  protected stop(midi: number): void {
    let found: Voice | null = null;
    for (const v of this.voices) {
      if (v.active && v.midi === midi && v.stoppable && v.relAt === Infinity && v.fastAt === Infinity && (!found || v.seq < found.seq)) found = v;
    }
    if (found) found.release();
  }

  /** A free voice; with none, the quietest is faded out and a spare is used. */
  private take(): number {
    let free = -1;
    let quiet = -1;
    let live = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (!v.active) {
        if (free < 0) free = i;
      } else if (v.fastAt === Infinity) {
        live++;
        if (quiet < 0 || v.loud < this.voices[quiet].loud) quiet = i;
      }
    }
    if (live >= this.limit && quiet >= 0) {
      const v = this.voices[quiet];
      v.fastAt = v.age;
      v.fastLen = this.stealSamples;
      v.invFast = 1 / this.stealSamples;
    }
    if (free >= 0) return free;
    // every voice busy, spares too: the quietest of all is cut
    let cut = 0;
    for (let i = 1; i < this.voices.length; i++) if (this.voices[i].loud < this.voices[cut].loud) cut = i;
    return cut;
  }

  protected play(out: Float32Array, from: number, count: number): void {
    const env = this.env;
    const acc = this.acc;
    for (const v of this.voices) {
      if (!v.active) continue;
      for (let i = 0; i < count; i++) {
        const a = v.age + i;
        let e = a * v.invRise;
        if (e > 1) e = 1;
        if (a >= v.relAt) e *= Math.max(0, 1 - (a - v.relAt) * v.invRel);
        if (a >= v.fastAt) e *= Math.max(0, 1 - (a - v.fastAt) * v.invFast);
        env[i] = e;
        acc[i] = 0;
      }
      // four partials to a pass: one trip through acc for four phasors
      let m = 0;
      for (; m + 3 < v.n; m += 4) {
        let re0 = v.re[m], im0 = v.im[m], re1 = v.re[m + 1], im1 = v.im[m + 1];
        let re2 = v.re[m + 2], im2 = v.im[m + 2], re3 = v.re[m + 3], im3 = v.im[m + 3];
        const c0 = v.c[m], s0 = v.s[m], c1 = v.c[m + 1], s1 = v.s[m + 1];
        const c2 = v.c[m + 2], s2 = v.s[m + 2], c3 = v.c[m + 3], s3 = v.s[m + 3];
        for (let i = 0; i < count; i++) {
          acc[i] += re0 + re1 + (re2 + re3);
          const r0 = re0 * c0 + im0 * s0;
          im0 = im0 * c0 - re0 * s0;
          re0 = r0;
          const r1 = re1 * c1 + im1 * s1;
          im1 = im1 * c1 - re1 * s1;
          re1 = r1;
          const r2 = re2 * c2 + im2 * s2;
          im2 = im2 * c2 - re2 * s2;
          re2 = r2;
          const r3 = re3 * c3 + im3 * s3;
          im3 = im3 * c3 - re3 * s3;
          re3 = r3;
        }
        v.re[m] = re0; v.im[m] = im0; v.re[m + 1] = re1; v.im[m + 1] = im1;
        v.re[m + 2] = re2; v.im[m + 2] = im2; v.re[m + 3] = re3; v.im[m + 3] = im3;
      }
      for (; m < v.n; m++) {
        let re = v.re[m];
        let im = v.im[m];
        const c = v.c[m];
        const s = v.s[m];
        for (let i = 0; i < count; i++) {
          acc[i] += re;
          const r = re * c + im * s;
          im = im * c - re * s;
          re = r;
        }
        v.re[m] = re;
        v.im[m] = im;
      }
      for (let i = 0; i < count; i++) out[from + i] += acc[i] * env[i];
      v.age += count;
    }
  }

  protected control(): void {
    for (const v of this.voices) {
      if (!v.active) continue;
      let sum = 0;
      for (let m = 0; m < v.n; ) {
        const mag = v.mag[m] * v.step[m];
        if (mag < v.floor[m]) {
          // 70 dB down: gone. The last partial takes its place.
          const last = --v.n;
          if (m !== last) {
            v.re[m] = v.re[last]; v.im[m] = v.im[last]; v.c[m] = v.c[last]; v.s[m] = v.s[last];
            v.step[m] = v.step[last]; v.mag[m] = v.mag[last]; v.floor[m] = v.floor[last];
            v.freq[m] = v.freq[last]; v.id[m] = v.id[last]; v.renorm[m] = v.renorm[last];
          }
          continue;
        }
        v.mag[m] = mag;
        if (v.renorm[m]) {
          const k = mag / Math.hypot(v.re[m], v.im[m]);
          v.re[m] *= k;
          v.im[m] *= k;
        }
        sum += mag;
        m++;
      }
      v.loud = sum;
      if (v.n === 0 || v.age >= v.relAt + v.relLen || v.age >= v.fastAt + v.fastLen) v.active = false;
    }
  }

  protected silence(): void {
    for (const v of this.voices) {
      v.active = false;
      v.re.fill(0);
      v.im.fill(0);
    }
  }

  protected sounding(): number {
    let n = 0;
    for (const v of this.voices) if (v.active) n++;
    return n;
  }

  /** The loudest sounding voice, or -1. */
  protected loudest(): number {
    let best = -1;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.active && (best < 0 || v.loud * (v.velocity + 1e-9) > this.voices[best].loud * (this.voices[best].velocity + 1e-9))) best = i;
    }
    return best;
  }

  /**
   * A string: the loudest note's displacement at 32 points is the sum over its partials of the
   * partial's real part times sin(hπx), h the harmonic (the string's own modes, fixed at both
   * ends); then up to 12 sounding notes as (midi, loudness), loudest first.
   */
  protected shape(into: Float32Array): void {
    const top = this.loudest();
    if (top < 0) return;
    const v = this.voices[top];
    let peak = 1e-12;
    for (let j = 0; j < 32; j++) {
      let y = 0;
      for (let m = 0; m < v.n; m++) y += v.re[m] * STRING_SIN[Math.min(32, v.id[m]) * 32 + j];
      into[8 + j] = y;
      if ((y < 0 ? -y : y) > peak) peak = y < 0 ? -y : y;
    }
    for (let j = 0; j < 32; j++) into[8 + j] /= peak;
    this.picked.fill(0);
    for (let k = 0; k < 12; k++) {
      let best = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const w = this.voices[i];
        if (w.active && !this.picked[i] && (best < 0 || w.loud * w.velocity > this.voices[best].loud * this.voices[best].velocity)) best = i;
      }
      if (best < 0) break;
      this.picked[best] = 1;
      into[40 + 2 * k] = this.voices[best].midi;
      into[41 + 2 * k] = this.voices[best].level() * this.voices[best].velocity;
    }
  }
}
