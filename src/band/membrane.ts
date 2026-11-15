// The drum kit as its modes. (The timpani and the tabla are modal: modal-drums.ts.)
//
// A struck membrane rings in its modes, each a damped sine; synthesis by modes adds them up
// (Adrien 1991, "The missing link: modal synthesis"). An ideal circular membrane's modes stand at
// the zeros of the Bessel functions, j_mn / j_01 = 1, 1.594, 2.136, 2.296, 2.653, 2.918 ...
// (Morse & Ingard, "Theoretical Acoustics", 1968): inharmonic, which is why a tom has no clear
// pitch. Where the stick lands decides how much each mode gets (a mode with a nodal line through
// the point gets nothing: the centre excites only the round modes). The stick is a short force
// pulse, softer and longer for a felt mallet, so a note grows from rest. A loose head is
// stretched further by a hard blow, so its pitch starts high and falls (tension modulation;
// Fletcher & Rossing 1998, §18.1): the kick's and toms' thump.
//
// Cymbals and hi-hats are plates, not membranes: a few high, closely spaced modes and a band of
// noise stand in for their thousands of modes. The snare's wires rattle against the lower head
// while the drum swings: noise, gated by the drum's own motion.
import { CONTROL, Noise, Player } from "./core.ts";

const BESSEL = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 3.652, 4.06, 4.154, 4.231, 4.601];

interface DrumSpec {
  /** mode frequencies as ratios to the lowest */
  ratios: number[];
  /** seconds for each mode to fall 60 dB */
  ring: number[];
  /** how much the stroke gives each mode */
  weights: number[];
  /** force pulse length in seconds, soft to hard */
  pulse: [number, number];
  /** pitch at the stroke above the resting pitch (a share), and how fast it falls back (s) */
  glide: number;
  glideTime: number;
  /** noise: how much, its band (Hz), how fast it dies (s), whether it follows the drum's motion */
  noise: number;
  noiseLow: number;
  noiseHigh: number;
  noiseRing: number;
  gated: boolean;
  /** output scale */
  gain: number;
}

/** One drum: a bank of modes, a force pulse, maybe a noise band. */
class Drum {
  count: number;
  re: Float64Array;
  im: Float64Array;
  cr: Float64Array;
  ci: Float64Array;
  weight: Float64Array;
  ratio: Float64Array;
  ring: Float64Array;
  /** per mode: below the top of the band the sample rate can hold */
  live: Uint8Array;
  base = 100;
  bend = 0;
  glideTime = 0.05;
  force = 0;
  pulseLeft = 0;
  pulseLength = 1;
  pulseAmp = 0;
  energy = 0;
  noiseAmp = 0;
  noiseFall = 0;
  noiseGain = 0;
  gated = false;
  // noise band: highpass then lowpass, one pole each
  hp1 = 0;
  hpx = 0;
  lp1 = 0;
  hpA = 0;
  lpA = 0;
  follow = 0;
  awake = false;
  gain = 1;
  /** its own noise, so the drums' draws never interleave differently with the block size */
  noise: Noise;
  constructor(readonly spec: DrumSpec, private readonly rate: number, seed = 1) {
    this.noise = new Noise(seed);
    this.count = spec.ratios.length;
    this.re = new Float64Array(this.count);
    this.im = new Float64Array(this.count);
    this.cr = new Float64Array(this.count);
    this.ci = new Float64Array(this.count);
    this.weight = Float64Array.from(spec.weights);
    this.ratio = Float64Array.from(spec.ratios);
    this.ring = Float64Array.from(spec.ring);
    this.live = new Uint8Array(this.count);
    this.glideTime = spec.glideTime;
    this.gated = spec.gated;
    this.gain = spec.gain;
    this.setBand(spec.noiseLow, spec.noiseHigh);
  }

  setBand(low: number, high: number): void {
    this.hpA = Math.exp((-2 * Math.PI * Math.min(low, 0.45 * this.rate)) / this.rate);
    this.lpA = Math.exp((-2 * Math.PI * Math.min(high, 0.45 * this.rate)) / this.rate);
  }

  /** The rotation and decay of each mode for the pitch now (called at control rate). */
  tune(): void {
    const f1 = this.base * (1 + this.bend);
    for (let m = 0; m < this.count; m++) {
      const f = f1 * this.ratio[m];
      const ok = f < 0.45 * this.rate;
      this.live[m] = ok ? 1 : 0;
      const w = (2 * Math.PI * (ok ? f : 0)) / this.rate;
      const r = Math.pow(10, -3 / (this.ring[m] * this.rate));
      this.cr[m] = r * Math.cos(w);
      this.ci[m] = r * Math.sin(w);
    }
  }

  strike(velocity: number): void {
    const soft = this.spec.pulse[0];
    const hard = this.spec.pulse[1];
    const pulse = soft + (hard - soft) * velocity;
    this.pulseLength = Math.max(2, Math.round(pulse * this.rate));
    this.pulseLeft = this.pulseLength;
    // the area under the pulse sets how hard the head is pushed, whatever its length
    this.pulseAmp = (velocity * (0.4 + 0.6 * velocity) * 2) / this.pulseLength;
    this.bend = this.spec.glide * velocity;
    this.noiseAmp = Math.max(this.noiseAmp, this.spec.noise * velocity);
    this.noiseFall = Math.pow(10, -3 / (this.spec.noiseRing * this.rate));
    this.awake = true;
    this.tune();
  }

  /** Slow changes: the glide falls back, a sleeping drum stops costing anything. */
  control(h: number): void {
    if (!this.awake) return;
    if (this.bend !== 0) {
      this.bend *= Math.exp(-h / this.glideTime);
      if (Math.abs(this.bend) < 1e-5) this.bend = 0;
      this.tune();
    }
    if (this.pulseLeft <= 0 && this.energy < 1e-12 && this.noiseAmp < 1e-6) this.awake = false;
  }

  play(out: Float32Array, from: number, count: number, k: number): void {
    const noise = this.noise;
    if (!this.awake) return;
    const n = this.count;
    const re = this.re;
    const im = this.im;
    const cr = this.cr;
    const ci = this.ci;
    const wt = this.weight;
    const live = this.live;
    let energy = this.energy;
    const gain = this.gain;
    for (let i = 0; i < count; i++) {
      let f = 0;
      if (this.pulseLeft > 0) {
        const x = 1 - this.pulseLeft / this.pulseLength;
        f = this.pulseAmp * (1 - Math.cos(2 * Math.PI * x));
        this.pulseLeft--;
      }
      let y = 0;
      for (let m = 0; m < n; m++) {
        const a = re[m];
        const b = im[m];
        re[m] = cr[m] * a - ci[m] * b + f * wt[m] * live[m];
        im[m] = ci[m] * a + cr[m] * b;
        y += im[m];
      }
      if (this.noiseAmp > 1e-6) {
        // a band of noise: highpassed, then lowpassed
        const white = noise.next();
        const hp = this.hpA * (this.hp1 + white - this.hpx);
        this.hpx = white;
        this.hp1 = hp;
        this.lp1 = (1 - this.lpA) * hp + this.lpA * this.lp1;
        let level = this.noiseAmp;
        if (this.gated) {
          // the snare wires rattle as long as the drum swings
          const big = y < 0 ? -y : y;
          this.follow += (big - this.follow) * 0.01;
          level *= Math.min(1, 40 * this.follow);
        }
        y += this.lp1 * level;
        this.noiseAmp *= this.noiseFall;
      }
      y *= gain;
      out[from + i] += y;
      energy += k * (y * y - energy);
    }
    this.energy = energy;
  }

  /** Mode amplitudes (0..1, relative to the largest) into into[at..at+16), ratios into into[ratioAt..]. */
  sense(into: Float32Array, at: number, ratioAt: number): void {
    let peak = 1e-12;
    for (let m = 0; m < this.count && m < 16; m++) {
      const a = Math.sqrt(this.re[m] * this.re[m] + this.im[m] * this.im[m]);
      into[at + m] = a;
      if (a > peak) peak = a;
    }
    for (let m = 0; m < 16; m++) {
      into[at + m] = m < this.count ? into[at + m] / peak : 0;
      into[ratioAt + m] = m < this.count ? this.ratio[m] : 0;
    }
  }
}

/** A drum's modes, rings and weights from a list of (ratio, ring, weight). */
function spec(modes: [number, number, number][], rest: Partial<DrumSpec>): DrumSpec {
  return {
    ratios: modes.map((m) => m[0]),
    ring: modes.map((m) => m[1]),
    weights: modes.map((m) => m[2]),
    pulse: [0.003, 0.0012],
    glide: 0,
    glideTime: 0.05,
    noise: 0,
    noiseLow: 1000,
    noiseHigh: 8000,
    noiseRing: 0.1,
    gated: false,
    gain: 1,
    ...rest,
  };
}

/** The Bessel modes with rings that shorten up the series and weights for a stroke `off` the centre (0 centre .. 1 rim). */
function membraneModes(count: number, ring: number, shorter: number, off: number): [number, number, number][] {
  // which of the first modes are round (m = 0): (0,1), (0,2), (0,3) are the 1st, 4th and 9th
  const round = new Set([0, 3, 8]);
  return BESSEL.slice(0, count).map((r, i) => [r, ring * Math.pow(shorter, i), round.has(i) ? 1 - 0.4 * off : off * (1 - i / (2 * count))]);
}

/** Shared: a set of drums played by note numbers. */
abstract class Drums extends Player {
  protected readonly family = 5;
  protected drums: Drum[] = [];
  protected rate: number;
  protected energyK: number;
  protected struck = 0;
  protected seed: number;

  constructor(sampleRate: number, seed: number) {
    super(sampleRate, 0.1);
    this.rate = sampleRate;
    this.seed = seed;
    this.energyK = 1 - Math.exp(-1 / (0.03 * sampleRate));
  }

  /** A noise of its own for every drum. */
  protected seedDrums(): void {
    this.drums.forEach((d, i) => (d.noise = new Noise(this.seed + 104729 * (i + 1))));
  }

  protected stop(): void {}

  protected silence(): void {
    for (const d of this.drums) {
      d.awake = false;
      d.re.fill(0);
      d.im.fill(0);
      d.noiseAmp = 0;
      d.energy = 0;
      d.pulseLeft = 0;
    }
  }

  protected control(): void {
    const h = CONTROL / this.rate;
    for (const d of this.drums) d.control(h);
  }

  protected play(out: Float32Array, from: number, count: number): void {
    for (const d of this.drums) d.play(out, from, count, this.energyK);
  }

  protected sounding(): number {
    let n = 0;
    for (const d of this.drums) if (d.awake) n++;
    return n;
  }

  protected shape(into: Float32Array): void {
    const d = this.drums[this.struck];
    if (d) d.sense(into, 8, 33);
    for (let i = 0; i < 8; i++) into[24 + i] = i < this.drums.length ? Math.min(1, Math.sqrt(this.drums[i].energy) / 0.1) : 0;
    into[32] = this.struck;
  }
}

/** General MIDI drums onto the kit's pieces: kick, snare, hi-hat, three toms, crash, ride. */
const PIECE: Record<number, number> = {
  35: 0, 36: 0,
  37: 1, 38: 1, 39: 1, 40: 1,
  42: 2, 44: 2, 46: 2,
  41: 3, 43: 3, 45: 4, 47: 4, 48: 5, 50: 5,
  49: 6, 52: 6, 55: 6, 57: 6,
  51: 7, 53: 7, 59: 7,
};
const TOM_PITCH: Record<number, number> = { 41: 82, 43: 98, 45: 110, 47: 131, 48: 147, 50: 175 };

export class Kit extends Drums {
  constructor(sampleRate: number) {
    super(sampleRate, 41);
    const plate = (base: number, count: number, ring: number): [number, number, number][] =>
      // a plate's modes: inharmonic, close together, rising faster than a membrane's
      Array.from({ length: count }, (_, i) => [Math.pow(1 + i, 1.35) * (1 + 0.07 * Math.sin(7.3 * i)), ring * Math.pow(0.9, i), 0.6 + 0.4 * Math.cos(2.1 * i)] as [number, number, number]).map(([r, t, w]) => [r * base, t, w] as [number, number, number]);
    this.drums = [
      // kick: a big loose head struck near the middle by a felt beater; its pitch drops after the blow
      new Drum(spec(membraneModes(6, 0.45, 0.8, 0.25), { pulse: [0.004, 0.0022], glide: 0.45, glideTime: 0.03, noise: 0.08, noiseLow: 1500, noiseHigh: 6000, noiseRing: 0.006, gain: 0.105 }), sampleRate),
      // snare: a tight head struck off centre, the wires gated by its swing
      new Drum(spec(membraneModes(10, 0.3, 0.85, 0.5), { pulse: [0.0018, 0.0008], glide: 0.08, glideTime: 0.02, noise: 0.5, noiseLow: 1800, noiseHigh: 7500, noiseRing: 0.18, gated: true, gain: 0.055 }), sampleRate),
      // hi-hat: two plates, and noise
      new Drum(spec(plate(1, 6, 0.08), { pulse: [0.0006, 0.0003], noise: 0.5, noiseLow: 6500, noiseHigh: 14000, noiseRing: 0.08, gain: 0.14 }), sampleRate),
      // toms: low, mid, high
      ...[0, 1, 2].map(() => new Drum(spec(membraneModes(8, 0.6, 0.8, 0.45), { pulse: [0.003, 0.0014], glide: 0.15, glideTime: 0.06, gain: 0.07 }), sampleRate)),
      // crash and ride
      new Drum(spec(plate(1, 8, 2.2), { pulse: [0.0008, 0.0004], noise: 0.45, noiseLow: 3500, noiseHigh: 12000, noiseRing: 2, gain: 0.095 }), sampleRate),
      new Drum(spec(plate(1, 8, 1.6), { pulse: [0.0008, 0.0004], noise: 0.18, noiseLow: 4000, noiseHigh: 11000, noiseRing: 1.4, gain: 0.07 }), sampleRate),
    ];
    this.drums[0].base = 52;
    this.drums[1].base = 185;
    this.drums[2].base = 3100;
    this.drums[6].base = 420;
    this.drums[7].base = 560;
    for (const d of this.drums) d.tune();
    this.seedDrums();
  }

  protected start(midi: number, velocity: number): void {
    const m = Math.round(midi);
    const piece = PIECE[m] ?? (m < 35 ? 0 : m <= 59 ? 1 : 3);
    const d = this.drums[piece];
    this.struck = piece;
    if (piece === 2) {
      // closed (42), pedal (44) or open (46): the same plates, held shut or let ring
      const ring = m === 46 ? 0.7 : m === 44 ? 0.05 : 0.09;
      d.spec.noiseRing = ring;
      d.ring.fill(ring);
      d.noiseAmp = 0;
    }
    if (piece >= 3 && piece <= 5) d.base = TOM_PITCH[m] ?? 110;
    if (m === 37) {
      // a side stick: the rim, short and dry
      d.spec.noise = 0.1;
    } else if (piece === 1) d.spec.noise = m === 40 ? 0.7 : 0.5;
    d.strike(velocity);
  }
}
