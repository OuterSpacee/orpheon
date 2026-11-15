// The vocal folds: two lips of tissue across the windpipe that the breath sets flapping.
//
// What is physical here and what is steered:
//
//   The flow is physical. Every sample the air through the glottis is solved from the lung
//   pressure below, the pressure in the throat above, and the opening between the folds
//   (Bernoulli's drop through the gap, the drag of a slit, the inertia of the plug of air in it;
//   Ishizaka & Flanagan 1972, in the one-equation form of Titze 1984). So the pulses lean and
//   ripple with the tube's resonances, a mouth that shuts raises the pressure above until the
//   flow stops, and an open glottis passes a rush of breath that turns turbulent.
//
//   Whether the folds vibrate is physical. They swing only while the pressure across them
//   exceeds a phonation threshold that grows with pitch and with how far apart (or how hard
//   together) they are held (Titze 1988, 1992), and they swing wider the further the pressure is
//   above it. They are slower to stop than to start (Lucero 1999).
//
//   The pitch is steered. A real larynx sets pitch by stretching the folds; a mass-and-spring
//   model of that drifts with breath and vowel by several percent. Here the cycle is a clock set
//   to Pose.pitch, and each fold's edge moves as the surface-wave picture of Titze (1988) says:
//   a lower and an upper lip of the fold swinging one after the other, the gap along the fold's
//   length following a string's first mode around a resting gap that widens toward the back.
import { DENSITY, VISCOSITY } from "./air.ts";
import type { Noise } from "./rng.ts";
import { HISS_CORNER } from "./tube.ts";

/** Points along the fold, front to back, where its gap is worked out. */
const NODES = 7;
/** Pressure lost through the gap, in units of ½ρv² (entry loss less the little recovered at the exit; Titze 1984). */
const DROP = 1.1;
/** Resistance of the airways below the folds, dyn·s/cm⁵ (about 1.5 cm H2O per litre a second). */
const BELOW = 1.5;
/** Breath noise as a fraction of the pressure dropped across the gap. */
const HISS = 0.1;
/** The glottal jet turns turbulent above this Reynolds number. */
const REYNOLDS_CRITICAL = 1200;
/** Vibrato rate in Hz (a trained singer's is 5 to 6; Sundberg 1987). */
const VIBRATO_RATE = 5.6;

export class Folds {
  // ── set by the voice every control tick ──
  /** Lung pressure, dyn/cm². */
  lung = 0;
  /** Pitch the folds are tuned to, Hz. */
  pitch = 220;
  /** Pose.glottis: 0 squeezed shut, 0.5 ordinary voice, 1 wide open. */
  gap = 1;
  /** Pose.register: 0 chest, 1 falsetto. */
  register = 0;
  /** Vibrato depth in cents. */
  vibrato = 0;

  // ── read by the voice ──
  /** Where the folds are in their cycle, 0..1; 0 is the instant the upper edges part. */
  phase = 0;
  /** Pitch sounding now, Hz. */
  sounding = 220;
  /** How wide the folds swing, 0 (still) to about 1 (a full sung note). */
  swing = 0;
  /** Opening between the folds now, cm². */
  area = 0;
  /** The same, averaged over a few cycles. */
  meanArea = 0;
  /** Flow through the glottis now, cm³/s, and averaged. */
  flow = 0;
  meanFlow = 0;
  /** Noise pressure being made at the glottis (smoothed), dyn/cm². */
  hiss = 0;
  /** Opening when held wide apart, cm²: the scale for "how open". */
  wide = 1;

  private length = 1.3;
  private thick = 0.4;
  private natural = 160;

  private across = 0;
  private amplitude = 0;
  // The resting gap and the swing glide from tick to tick: under pressure, steps would click.
  private rest = new Float64Array(NODES);
  private restStep = new Float64Array(NODES);
  private restGoal = new Float64Array(NODES);
  private reach = 0;
  private reachStep = 0;
  private mode = new Float64Array(NODES);
  private lagCos = 1;
  private lagSin = 0;
  private bend = 1;
  private wobble = 0;
  private jitter = 0;
  private shimmer = 1;
  private drift = 0;
  private dropWas = 0;
  private toneA = 0;
  private toneB = 0;
  private reynolds = 0;

  constructor(private noise: Noise) {
    for (let k = 0; k < NODES; k++) this.mode[k] = Math.sin((Math.PI * k) / (NODES - 1));
    this.setBody(0.5);
  }

  /** Body.folds: 0 small and light to 1 long and heavy. */
  setBody(size: number): void {
    // Vibrating length about 0.6 cm in a child, 1.0 in a woman, 1.6 in a man (Titze 1989).
    this.length = 0.55 + 1.05 * size;
    this.thick = 0.25 + 0.25 * size;
    // The pitch this larynx speaks at: where its threshold pressure is lowest.
    this.natural = 280 - 170 * size;
    this.wide = 0.3 * this.length * this.length;
    this.reynolds = (2 * DENSITY) / (VISCOSITY * this.length);
  }

  clear(): void {
    this.across = this.amplitude = this.reach = this.reachStep = this.swing = this.flow = this.meanFlow = this.hiss = this.dropWas = 0;
    this.phase = 0;
  }

  /** Once per control tick of `h` seconds, which is `steps` samples: the slow things. */
  tick(h: number, steps: number): void {
    const { length, register } = this;
    const pitch = this.pitch < 40 ? 40 : this.pitch > 1500 ? 1500 : this.pitch;

    // Resting half-gap along the fold. Past ordinary voice the back (the vocal processes) parts
    // and the front stays; below it the folds are pressed together along their whole length.
    const x = this.gap - 0.5;
    const apart = x > 0 ? 0.012 + 0.19 * x + 0.77 * x * x : 0.012 + 0.16 * x - 0.33 * x * x;
    const base = 0.012 + 0.008 * register;
    for (let k = 0; k < NODES; k++) {
      const y = k / (NODES - 1);
      this.rest[k] = this.restGoal[k];
      this.restGoal[k] = length * (base + (apart > 0 ? apart * y : apart * (0.4 + 0.6 * y)));
      this.restStep[k] = (this.restGoal[k] - this.rest[k]) / steps;
    }

    // Phonation threshold pressure. Titze (1992) fits 0.14 + 0.06·(F0/F0n)² kPa near the speaking
    // pitch; above twice that pitch this model lets it rise more slowly so a soprano can reach
    // her top, and falsetto (thin edges) needs less. Held apart or squeezed, it rises steeply.
    const ratio = pitch / this.natural;
    let threshold = ratio < 2 ? 1400 + 600 * ratio * ratio : 3800 + 800 * (ratio - 2);
    threshold *= 1 - 0.4 * register;
    const x2 = x * x;
    threshold *= x > 0 ? 1 + 8 * x2 + 300 * x2 * x2 : 1 + 6 * x2 + 2000 * x2 * x2 * x2;
    // Folds already swinging keep going at a lower pressure than it takes to start them.
    if (this.amplitude > 0.004 * length) threshold *= 0.75;

    // How wide they swing: with the square root of the pressure above threshold (the amplitude
    // law of an oscillator just past onset), less at high pitch where the folds are stretched
    // taut, less in falsetto. Titze's rule of thumb is about a twentieth of the fold's length.
    const above = this.across - threshold;
    let goal = 0;
    if (above > 0) {
      let taut = Math.sqrt(this.natural / pitch);
      if (taut > 1.25) taut = 1.25;
      if (taut < 0.3) taut = 0.3;
      goal = 0.06 * length * Math.sqrt(above / 6000) * taut * (1 - 0.45 * register);
    }
    this.reach = this.amplitude;
    this.amplitude += (goal - this.amplitude) * (1 - Math.exp(-h / (goal > this.amplitude ? 0.008 : 0.006)));
    this.reachStep = (this.amplitude - this.reach) / steps;
    this.swing = this.amplitude / (0.06 * length);
    if (this.swing > 1) this.swing = 1;

    // The upper edge follows the lower by a fraction of the cycle: a lot in chest voice, where
    // the fold is thick and a wave rolls up its face, little in falsetto.
    const lag = 0.7 - 0.55 * register;
    this.lagCos = Math.cos(lag);
    this.lagSin = Math.sin(lag);

    this.wobble += VIBRATO_RATE * h;
    if (this.wobble >= 1) this.wobble -= 1;
    this.bend = Math.exp(((this.vibrato * Math.sin(2 * Math.PI * this.wobble)) / 1200) * Math.LN2);
    this.sounding = pitch * this.bend * (1 + this.jitter + this.drift);
  }

  /**
   * One sample: the flow through the glottis, cm³/s. `back` is the wave arriving from the tube
   * and `entry` the impedance of the tube's first slice; the caller sends back + entry × flow up
   * the tube.
   */
  step(dt: number, back: number, entry: number): number {
    // The clock. No two cycles of a real voice are alike: each gets its own small error in
    // length (jitter) and size (shimmer), and the pitch wanders slowly.
    this.phase += this.sounding * dt;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.jitter = 0.006 * this.noise.next();
      this.shimmer = 1 + 0.03 * this.noise.next();
      this.drift += 0.08 * (0.01 * this.noise.next() - this.drift);
    }

    // The gap. Lower and upper edges, each integrated along the fold where it is open.
    const angle = 2 * Math.PI * this.phase;
    const upper = Math.sin(angle);
    const lower = upper * this.lagCos + Math.cos(angle) * this.lagSin;
    const amp = (this.reach += this.reachStep) * this.shimmer;
    const { rest, restStep, mode } = this;
    let low = 0;
    let up = 0;
    let l0 = (rest[0] += restStep[0]);
    let u0 = l0;
    for (let k = 1; k < NODES; k++) {
      const swing = amp * mode[k];
      const at = (rest[k] += restStep[k]);
      const l1 = at + swing * lower;
      const u1 = at + swing * upper;
      low += openPart(l0, l1);
      up += openPart(u0, u1);
      l0 = l1;
      u0 = u1;
    }
    // The air must pass both edges; the narrower one rules, with the corner rounded off.
    const round = 0.1 * amp;
    const d = low - up;
    let narrow = 0.5 * (low + up - Math.sqrt(d * d + round * round));
    if (narrow < 0) narrow = 0;
    const area = ((2 * this.length) / (NODES - 1)) * narrow;
    this.area = area;

    let u = 0;
    if (area > 1e-7) {
      // Breath noise, from the flow a moment ago.
      const was = this.flow;
      const re = this.reynolds * (was < 0 ? -was : was);
      let source = 0;
      if (re > REYNOLDS_CRITICAL) {
        const level = HISS * this.dropWas * (1 - (REYNOLDS_CRITICAL * REYNOLDS_CRITICAL) / (re * re));
        // Coloured like the turbulence in the mouth (see HISS_CORNER).
        const tone = 1 - Math.exp(-2 * Math.PI * HISS_CORNER * dt);
        this.toneA += tone * (this.noise.next() * Math.sqrt(1 / (48000 * dt)) - this.toneA);
        this.toneB += tone * (this.toneA - this.toneB);
        source = level * this.toneB;
        this.hiss += 0.02 * (level - this.hiss);
      }
      const drop = (DROP * DENSITY) / (2 * area * area);
      const drag = (12 * VISCOSITY * this.thick * this.length * this.length) / (area * area * area);
      const plug = (DENSITY * this.thick) / (area * dt);
      const linear = entry + BELOW + drag + plug;
      const drive = this.lung - 2 * back + source + plug * was;
      u = (2 * drive) / (linear + Math.sqrt(linear * linear + 4 * drop * (drive < 0 ? -drive : drive)));
      this.dropWas = drop * u * u;
    } else {
      this.dropWas = 0;
    }
    this.hiss *= 0.999;
    this.flow = u;

    // The pressure across the folds, smoothed over a few milliseconds: what drives their swing.
    const above = 2 * back + entry * u;
    this.across += 250 * dt * (this.lung - BELOW * u - above - this.across);
    this.meanArea += 60 * dt * (area - this.meanArea);
    this.meanFlow += 60 * dt * (u - this.meanFlow);
    return u;
  }
}

/** Area under a straight line from a to b across one unit, counting only where it is above zero. */
function openPart(a: number, b: number): number {
  if (a >= 0) {
    if (b >= 0) return 0.5 * (a + b);
    return (0.5 * a * a) / (a - b);
  }
  if (b <= 0) return 0;
  return (0.5 * b * b) / (b - a);
}
