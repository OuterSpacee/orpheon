// The strings of the band as modal instruments: a note is a row of harmonics, each a decaying
// phasor, exactly in tune (see modal.ts). The recipes:
//
//   plucked    harmonic k has the weight sin(kπp)/k^q of a string plucked at the fraction p of its
//              length (a node of mode k at the plucking point makes it silent), and the high
//              harmonics die first (decay time falls with k). Bass, harp, guitar, sarod.
//   tanpura    the same row, but its curved bridge keeps the high harmonics ringing nearly as
//              long as the low ones, so the drone shimmers.
//   bowed      a soft sawtooth, 1/k^1.7, that never decays while held and swells in and out;
//              three players a few cents apart, so the unison beats slowly. Strings, esraj.
import { hz, ModalPlayer, TAU60, Voice } from "./modal.ts";

/** Seconds for 60 dB, from `low` at midi `a` to `high` at midi `b`, evenly in log time. */
const ringing = (a: number, low: number, b: number, high: number) => (midi: number) => {
  const x = Math.max(0, Math.min(1, (midi - a) / (b - a)));
  return low * Math.pow(high / low, x);
};

interface Pluck {
  harmonics: number;
  /** where the string is plucked, as a fraction of its length */
  at: number;
  /** the fall of the harmonics' weights: 1/k^power */
  power: number;
  /** how much faster harmonic k dies: decay time / (1 + spread·k) */
  spread: number;
  /** seconds for the fundamental to fall 60 dB */
  ring: (midi: number) => number;
  /** loudness at velocity 1 */
  gain: number;
  attack: number;
  /** a note is let go at its end, but not before this many seconds */
  minRing: number;
  release: number;
}

function pluck(v: Voice, p: Pluck, midi: number, velocity: number): void {
  const f = hz(midi);
  const tau = p.ring(midi) * TAU60;
  for (let k = 1; k <= p.harmonics; k++) {
    v.mode(f * k, velocity * p.gain * Math.sin(k * Math.PI * p.at) / Math.pow(k, p.power), tau / (1 + p.spread * (k - 1)), k);
  }
  v.envelope(p.attack, p.release, p.minRing);
}

abstract class Plucked extends ModalPlayer {
  protected readonly family = 1;
  protected abstract readonly profile: Pluck;
  protected recipe(v: Voice, midi: number, velocity: number): void {
    pluck(v, this.profile, midi, velocity);
  }
}

/** A double bass, pizzicato: plucked a quarter of the way down, damped by the finger when let go. */
export class Bass extends Plucked {
  protected readonly profile: Pluck = { harmonics: 18, at: 0.25, power: 1.3, spread: 0.3, ring: ringing(28, 2.6, 55, 1.4), gain: 0.42, attack: 0.002, minRing: 0.25, release: 0.15 };
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 4);
  }
}

/** A concert harp: plucked a fifth of the way down, left to ring. */
export class Harp extends Plucked {
  protected readonly profile: Pluck = { harmonics: 20, at: 0.2, power: 1.3, spread: 0.22, ring: ringing(48, 7, 96, 2.2), gain: 0.24, attack: 0.002, minRing: 2.2, release: 0.12 };
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 14);
  }
}

/** A steel-string guitar: a plectrum near the bridge, brighter and shorter than the harp. */
export class Guitar extends Plucked {
  protected readonly profile: Pluck = { harmonics: 20, at: 0.12, power: 1.0, spread: 0.3, ring: ringing(40, 3.2, 86, 1.2), gain: 0.2, attack: 0.002, minRing: 0.2, release: 0.2 };
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 8);
  }
}

/** A sarod: steel strings plucked near the bridge over a steel fingerboard, bright, the highs dying first. */
export class Sarod extends Plucked {
  protected readonly profile: Pluck = { harmonics: 20, at: 1 / 9, power: 1.1, spread: 0.3, ring: () => 1.1 * 6.9, gain: 0.25, attack: 0.002, minRing: 1.8, release: 0.08 };
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 12);
  }
}

/** A tanpura: long open strings, all twenty harmonics ringing nearly as long as the first. */
export class Tanpura extends ModalPlayer {
  protected readonly family = 1;
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 6);
  }
  protected recipe(v: Voice, midi: number, velocity: number): void {
    const f = hz(midi);
    for (let k = 0; k < 20; k++) {
      v.mode(f * (k + 1), (velocity * 0.26 * (0.6 + 0.4 * Math.cos(1.3 * k))) / Math.pow(k + 1, 0.8), 1.5 / (1 + 0.05 * k), k + 1);
    }
    v.envelope(0.012, 0.6, 0);
  }
}

/** Three players a few cents apart, each a soft sawtooth that swells in and out. */
abstract class Bowed extends ModalPlayer {
  protected readonly family = 2;
  protected abstract readonly attack: number;
  protected abstract readonly gain: number;
  protected recipe(v: Voice, midi: number, velocity: number): void {
    for (const cents of [-6, 0, 6]) {
      const f = hz(midi + cents / 100);
      for (let k = 1; k <= 8; k++) v.mode(f * k, (velocity * this.gain) / 3 / Math.pow(k, 1.7), 1e6, k);
    }
    v.envelope(this.attack, 0.45, 0);
  }
}

/** The string section: cellos to violins. */
export class Strings extends Bowed {
  protected readonly attack = 0.25;
  protected readonly gain = 0.22;
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 12);
  }
}

/** An esraj: a bowed string that holds its note softly, a little slower to speak than the section. */
export class Esraj extends Bowed {
  protected readonly attack = 0.3;
  protected readonly gain = 0.45;
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 6);
  }
}
