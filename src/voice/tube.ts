// The air column: sound travelling in a tube whose cross-section changes along its length.
//
// The airway is cut into SECTIONS slices of equal length. In each slice a pressure wave runs
// forward (toward the lips) and another runs back; where two slices of different area meet, part
// of each wave passes and part reflects (Kelly & Lochbaum 1962). One "tick" is the time sound
// takes to cross one slice, so a wave written into a slice at one tick is read at its far end on
// the next. A junction only ever hears from its two neighbours one tick earlier, so the even
// junctions and the odd junctions can take turns: one sample of the simulation is an even
// half-step followed by an odd one, and lasts two ticks.
//
// The slices do not have a fixed length. A longer throat means longer slices and so a longer
// tick: the simulation runs at its own rate (SECTIONS/2 × speed of sound / tract length) and
// resample.ts brings it to the device rate.
//
// On top of the lossless tube:
//   walls      every even junction has a patch of soft wall (a mass on a spring with a damper)
//              that the pressure pushes outward. It damps the low resonances, sets the lowest
//              resonance of a closed mouth near 180 Hz, and gives a voiced stop somewhere to put
//              the air while the folds keep going.
//   friction   every odd junction takes a little out of the flow (viscous and heat losses at the
//              wall of the tube).
//   valves     wherever the tube is narrow, the pressure across the gap follows Bernoulli:
//              drop = ½ρ(u/A)², plus the viscous drag of a slit. This is what lets pressure build
//              behind a closure and what sets how much air a fricative passes.
//   hiss       air forced through a valve faster than a critical Reynolds number turns turbulent
//              and makes noise there, and more where the jet strikes the teeth.
//   the nose   a side tube joining at PORT, open as far as the velum lets it.
//   radiation  the lips and nostrils open into free air like a piston in a wall.
import { LANDMARK } from "../contract.ts";
import { DENSITY, IMPEDANCE, SOUND, VISCOSITY } from "./air.ts";
import type { Noise } from "./rng.ts";

/** Slices from the folds to the lips. Junction j sits between slice j-1 and slice j. */
export const SECTIONS = 48;
/** Slices from the velar port to the nostrils. Even, so the nostrils share the lips' half-step. */
export const NOSE_SECTIONS = 30;
/** The junction where the nose joins. Even, so it shares the folds' and lips' half-step. */
export const PORT = 2 * Math.round((LANDMARK.nosePort * SECTIONS) / 2);
/** The junction at the upper teeth, where a jet from further back strikes an edge. */
export const TEETH = 2 * Math.round((LANDMARK.teeth * SECTIONS) / 2);
/** No slice is ever narrower than this, so no impedance is ever infinite. A shut gap is shut by its valve. */
export const AREA_FLOOR = 1e-5;

// The wall of the tract per cm² of surface: mass (g), damping (g/s) and stiffness (g/s²). Chosen
// to give the closed-mouth resonance Fujimura & Lindqvist (1971) measured (about 180 Hz, 75 Hz
// wide), inside the range Ishizaka, French & Flanagan (1975) measured on the cheek and neck.
const WALL_MASS = 2.1;
const WALL_DRAG = 1000;
const WALL_SPRING = 84500;

// Viscous and thermal loss at a smooth round wall (Kirchhoff's wide-tube formula) is
// attenuation = (1/(radius·c)) · sqrt(ω·ν/2) · (1 + (γ-1)/sqrt(Pr)) per cm. It grows with the
// square root of frequency; this model takes it at 1.5 kHz, in the middle of the formants, and
// applies it to the flow only so that a steady pressure is not leaked away.
const KIRCHHOFF = (Math.sqrt((2 * Math.PI * 1500 * (VISCOSITY / DENSITY)) / 2) * 1.475) / SOUND;
/**
 * The tract is not round or smooth; the nose, full of folded bone, far less so. The nose's value
 * puts the murmur of n and m about 11 dB under the vowel next to it, as a studio narrator's n is
 * (13 dB; at 8 it was 6 dB, nearly as loud as an l, and n was heard as l: tools/voice-pairs.ts).
 */
const ROUGH_TRACT = 2;
const ROUGH_NOSE = 32;

/** A slice narrower than this (cm²) that is the narrowest of its neighbours gets a valve. */
const VALVE_BELOW = 0.6;
const MAX_VALVES = 4;
/** Width of the slit a narrow gap is taken to be, for its viscous drag (cm). */
const SLIT_WIDTH = 1.2;

/** Flow turns turbulent above this Reynolds number (Meyer-Eppler 1953 found about 1800 for fricatives). */
const REYNOLDS_CRITICAL = 1800;
/** Noise pressure made at the gap itself, as a fraction of the jet's dynamic pressure ½ρv². */
const HISS_AT_GAP = 0.06;
/** The same where the jet strikes the teeth: an obstacle is a far better noise maker (Shadle 1985). */
const HISS_AT_TEETH = 0.4;
/** The same at the lips, where the jet leaves over the edge of the teeth and lip. */
const HISS_AT_LIPS = 0.35;
/** The jet fades before it reaches the teeth: its reach, as a fraction of the tract's length. */
const JET_REACH = 0.15;
/**
 * Turbulence is not white: its spectrum is broad up to about 0.2 × jet speed / gap width (a
 * Strouhal number; a few kHz for a fricative) and falls away above (Stevens 1971, Shadle 1985).
 * The noise is passed through two one-pole low-passes at this corner, Hz.
 */
export const HISS_CORNER = 4000;

/** Telemetry is gathered every this many samples. */
const WATCH_EVERY = 4;

export class Tube {
  /** Waves entering each slice at its fold end (f) and at its lip end (b). */
  readonly f = new Float64Array(SECTIONS);
  readonly b = new Float64Array(SECTIONS);
  readonly noseF = new Float64Array(NOSE_SECTIONS);
  readonly noseB = new Float64Array(NOSE_SECTIONS);

  /** Seconds per sample of this simulation (two ticks). */
  dt = 1 / 48000;
  /** Impedance of the first slice, for the folds. */
  entry = IMPEDANCE;
  /** Air leaving the lips and the nostrils, cm³/s, after the last step. */
  lipFlow = 0;
  noseFlow = 0;
  /**
   * Air the walls of the throat and mouth are displacing outward, cm³/s. Flesh does not
   * compress, so the skin of the neck and cheeks moves by as much and radiates it: the low hum
   * heard through a closed mouth while a b or d is held.
   */
  wallFlow = 0;

  // What the view watches: per slice, the steady pressure and the power of the sound around it.
  readonly steady = new Float64Array(SECTIONS);
  readonly power = new Float64Array(SECTIONS);
  readonly noseSteady = new Float64Array(NOSE_SECTIONS);
  readonly nosePower = new Float64Array(NOSE_SECTIONS);
  /** Noise pressure being made at each junction (dyn/cm², smoothed). */
  readonly hiss = new Float64Array(SECTIONS + 1);

  // Junction j: `share` is how much of the junction's pressure comes from the wave arriving from
  // the fold side. It glides to `shareGoal` over a control tick so a moving tongue makes no steps.
  private share = new Float64Array(SECTIONS + 1);
  private shareStep = new Float64Array(SECTIONS + 1);
  private shareGoal = new Float64Array(SECTIONS + 1);
  // Even junctions: the wall's part in the junction, and the wall's own motion.
  private wall = new Float64Array(SECTIONS + 1);
  private wallStep = new Float64Array(SECTIONS + 1);
  private wallGoal = new Float64Array(SECTIONS + 1);
  private wallSurface = new Float64Array(SECTIONS + 1);
  private wallPush = new Float64Array(SECTIONS + 1);
  private wallOut = new Float64Array(SECTIONS + 1);
  // Odd junctions: the fraction of the flow that friction lets through.
  private pass = new Float64Array(SECTIONS + 1).fill(1);

  private noseShare = new Float64Array(NOSE_SECTIONS + 1);
  private noseWall = new Float64Array(NOSE_SECTIONS + 1);
  private noseWallPush = new Float64Array(NOSE_SECTIONS + 1);
  private noseWallOut = new Float64Array(NOSE_SECTIONS + 1);
  private nosePass = new Float64Array(NOSE_SECTIONS + 1).fill(1);
  private noseArea = new Float64Array(NOSE_SECTIONS);

  // The three-way junction at the port.
  private portBack = 1;
  private portBackStep = 0;
  private portBackGoal = 1;
  private portNose = 0;
  private portNoseStep = 0;
  private portNoseGoal = 0;
  // The valve just inside the nose (nose junction 1): the port itself. Like every valve, its
  // area glides sample by sample: a gap under pressure that opened in steps would click.
  private portArea = AREA_FLOOR;
  private portAreaStep = 0;
  private portAreaGoal = AREA_FLOOR;
  private portZr = 1;

  // Valves in the mouth and throat: where each is, and the areas of its gap and of the slices
  // either side.
  private valves = 0;
  private valveAt = new Int32Array(MAX_VALVES);
  private valveGap = new Float64Array(MAX_VALVES);
  private valveGapStep = new Float64Array(MAX_VALVES);
  private valveLeft = new Float64Array(MAX_VALVES);
  private valveLeftStep = new Float64Array(MAX_VALVES);
  private valveRight = new Float64Array(MAX_VALVES);
  private valveRightStep = new Float64Array(MAX_VALVES);
  private valveToTeeth = new Float64Array(MAX_VALVES);
  /** Flow through junction j while it is a valve (it drives that valve's turbulence). */
  private flowAt = new Float64Array(SECTIONS + 1);
  /** Which junctions were valves at the last shape, and are now. */
  private wasValve = new Uint8Array(SECTIONS + 1);
  private isValveNow = new Uint8Array(SECTIONS + 1);
  /** The shape before this one, to glide from. */
  private areaWas = new Float64Array(SECTIONS).fill(1);
  private slice = 0.36;

  // The teeth.
  private teethFore = 0.5;
  /** Dynamic pressure of the jets aimed at the teeth, from the valves of each half-step. */
  private jetEven = 0;
  private jetOdd = 0;

  // The lips: a valve opening into the radiation load.
  private lipArea = 1;
  private lipAreaStep = 0;
  private lipFlux = 0;
  private lipPressure = 0;
  // The nostrils.
  private nostrilAdmit = 1;
  private nostrilYield = 1;
  private nostrilSpring = 0;
  private nostrilFlux = 0;
  private nostrilPressure = 0;

  // Noise colouring: two low-pass stages for each source (four valves, the teeth, the lips).
  private tone = 0;
  private toneScale = 1;
  private toneA = new Float64Array(MAX_VALVES + 2);
  private toneB = new Float64Array(MAX_VALVES + 2);

  private wallGain = 0;
  private wallInertia = 0;
  private count = 0;
  private watchSteady = 0;
  private watchPower = 0;
  private hissFade = 0;

  constructor(private noise: Noise) {}

  /** Empty the tube: no sound, no pressure, walls at rest. */
  clear(): void {
    this.f.fill(0);
    this.b.fill(0);
    this.noseF.fill(0);
    this.noseB.fill(0);
    this.wallPush.fill(0);
    this.wallOut.fill(0);
    this.noseWallPush.fill(0);
    this.noseWallOut.fill(0);
    this.flowAt.fill(0);
    this.steady.fill(0);
    this.power.fill(0);
    this.noseSteady.fill(0);
    this.nosePower.fill(0);
    this.hiss.fill(0);
    this.toneA.fill(0);
    this.toneB.fill(0);
    this.lipFlux = this.lipPressure = this.nostrilFlux = this.nostrilPressure = 0;
    this.lipFlow = this.noseFlow = this.wallFlow = this.jetEven = this.jetOdd = 0;
  }

  /**
   * The nose's own shape (fixed for a body): areas in cm² from the port to the nostrils. Slice 0
   * is the port and is set by shape().
   */
  setNose(area: Float64Array): void {
    this.noseArea.set(area);
  }

  /**
   * Give the tube a new shape, reached smoothly over the next `steps` samples.
   * `area` is SECTIONS areas in cm², `port` the opening into the nose, `slice` the length of one
   * slice in cm.
   */
  shape(area: Float64Array, port: number, slice: number, steps: number): void {
    const dt = (2 * slice) / SOUND;
    this.dt = dt;
    // The wall, stepped implicitly: velocity = wallGain × (pressure + what its past pushes with).
    this.wallInertia = WALL_MASS / dt;
    this.wallGain = 1 / (this.wallInertia + WALL_DRAG + WALL_SPRING * dt);
    this.entry = IMPEDANCE / area[0];
    this.watchSteady = 1 - Math.exp((-WATCH_EVERY * dt) / 0.03);
    this.watchPower = 1 - Math.exp((-WATCH_EVERY * dt) / 0.02);
    this.hissFade = Math.exp(-(steps * dt) / 0.01);
    this.tone = 1 - Math.exp(-2 * Math.PI * HISS_CORNER * dt);
    // White noise is thinner per Hz the faster it is sampled; keep its density the same for every body.
    this.toneScale = Math.sqrt(1 / (48000 * dt));

    this.slice = slice;
    this.findValves(area, 1 / steps);

    const { share, shareGoal, shareStep, wall, wallGoal, wallStep, pass } = this;
    const inv = 1 / steps;
    for (let j = 1; j < SECTIONS; j++) {
      const left = area[j - 1];
      const right = area[j];
      share[j] = shareGoal[j];
      if (j & 1) {
        const radius = Math.sqrt(Math.min(left, right) / Math.PI);
        const loss = Math.min(0.5, (4 * ROUGH_TRACT * KIRCHHOFF * slice) / radius);
        const through = left / (1 + loss);
        shareGoal[j] = (2 * through) / (through + right);
        pass[j] = 1 / (1 + loss);
      } else {
        // The patch of wall at this junction covers two slices.
        const surface = this.isValve(j) ? 0 : 2 * Math.sqrt(Math.PI * 0.5 * (left + right)) * 2 * slice;
        const give = IMPEDANCE * surface * this.wallGain;
        const all = left + right + give;
        this.wallSurface[j] = surface;
        wall[j] = wallGoal[j];
        shareGoal[j] = (2 * left) / all;
        wallGoal[j] = give / all;
        wallStep[j] = (wallGoal[j] - wall[j]) * inv;
      }
      shareStep[j] = (shareGoal[j] - share[j]) * inv;
    }

    // The port: three tubes meet, and all three feel one pressure.
    const nose = this.noseArea;
    nose[0] = port > AREA_FLOOR ? port : AREA_FLOOR;
    const back = area[PORT - 1];
    const all = back + area[PORT] + (port > AREA_FLOOR ? port : 0);
    this.portBack = this.portBackGoal;
    this.portNose = this.portNoseGoal;
    this.portBackGoal = (2 * back) / all;
    this.portNoseGoal = (2 * (port > AREA_FLOOR ? port : 0)) / all;
    this.portBackStep = (this.portBackGoal - this.portBack) * inv;
    this.portNoseStep = (this.portNoseGoal - this.portNose) * inv;
    this.portArea = this.portAreaGoal;
    this.portAreaStep = (nose[0] - this.portArea) * inv;
    this.portAreaGoal = nose[0];
    this.portZr = IMPEDANCE / nose[1];
    this.shapeNose(slice);

    // The teeth: a pressure source in a tube sends its push forward and back in proportion to
    // the areas either side.
    this.teethFore = area[TEETH - 1] / (area[TEETH - 1] + area[TEETH]);

    // The lips.
    this.lipArea = this.areaWas[SECTIONS - 1];
    this.lipAreaStep = (area[SECTIONS - 1] - this.lipArea) * inv;
    // The nostrils.
    const nostril = nose[NOSE_SECTIONS - 1];
    this.nostrilAdmit = nostril / IMPEDANCE;
    this.nostrilSpring = PISTON_SPRING * Math.sqrt(nostril);
    this.nostrilYield = 1 / (this.nostrilAdmit + PISTON_ADMIT * nostril + 0.5 * dt * this.nostrilSpring);

    const hiss = this.hiss;
    for (let j = 0; j <= SECTIONS; j++) hiss[j] *= this.hissFade;
    this.areaWas.set(area);
  }

  /** One sample. The folds have already written their wave into f[0]. */
  step(): void {
    const { f, b, share, shareStep, wall, wallStep, wallPush, wallOut, wallSurface, pass } = this;
    const dt = this.dt;
    const gain = this.wallGain;
    const inertia = this.wallInertia;
    let walls = 0;

    // ── even half-step ──
    for (let j = 2; j < SECTIONS; j += 2) {
      if (j === PORT) continue;
      const fi = f[j - 1];
      const bi = b[j];
      const s = (share[j] += shareStep[j]);
      const w = (wall[j] += wallStep[j]);
      const push = wallPush[j];
      const p = s * fi + (2 - 2 * w - s) * bi - w * push;
      b[j - 1] = p - fi;
      f[j] = p - bi;
      const v = gain * (p + push);
      const out = (wallOut[j] += dt * v);
      wallPush[j] = inertia * v - WALL_SPRING * out;
      walls += wallSurface[j] * v;
    }
    this.wallFlow = walls;
    {
      const fi = f[PORT - 1];
      const bi = b[PORT];
      const ni = this.noseB[0];
      const sb = (this.portBack += this.portBackStep);
      const sn = (this.portNose += this.portNoseStep);
      const p = sb * fi + (2 - sb - sn) * bi + sn * ni;
      b[PORT - 1] = p - fi;
      f[PORT] = p - bi;
      this.noseF[0] = p - ni;
    }
    this.stepValves(0);
    this.stepTeeth();
    this.stepLips();
    this.stepNose(0);

    // ── odd half-step ──
    for (let j = 1; j < SECTIONS; j += 2) {
      const fi = f[j - 1];
      const bi = b[j];
      const s = (share[j] += shareStep[j]);
      const p = s * fi + (2 - s) * bi;
      f[j] = p - bi;
      b[j - 1] = fi - pass[j] * (2 * fi - p);
    }
    this.stepValves(1);
    this.stepNose(1);

    if ((++this.count & (WATCH_EVERY - 1)) === 0) this.watch();
  }

  /** The next sample of coloured noise for source `n`. */
  private coloured(n: number): number {
    const a = (this.toneA[n] += this.tone * (this.noise.next() * this.toneScale - this.toneA[n]));
    return (this.toneB[n] += this.tone * (a - this.toneB[n]));
  }

  /** Is junction j one of the valves? */
  private isValve(j: number): boolean {
    for (let v = 0; v < this.valves; v++) if (this.valveAt[v] === j) return true;
    return false;
  }

  /** Put a valve at the lip end of every slice that is narrow and narrower than its neighbours. */
  private findValves(area: Float64Array, inv: number): void {
    const was = this.areaWas;
    let n = 0;
    for (let c = 1; c < SECTIONS - 1; c++) {
      const a = area[c];
      if (a >= VALVE_BELOW || a > area[c - 1] || a >= area[c + 1]) continue;
      let slot = n;
      if (n < MAX_VALVES) n++;
      else {
        // Full: keep the tightest.
        slot = 0;
        for (let v = 1; v < MAX_VALVES; v++) if (this.valveGap[v] > this.valveGap[slot]) slot = v;
        if (a >= this.valveGap[slot]) continue;
      }
      const at = c + 1 === PORT ? c : c + 1;
      this.valveAt[slot] = at;
      this.valveGap[slot] = was[c];
      this.valveGapStep[slot] = (a - was[c]) * inv;
      this.valveLeft[slot] = was[at - 1];
      this.valveLeftStep[slot] = (area[at - 1] - was[at - 1]) * inv;
      this.valveRight[slot] = was[at];
      this.valveRightStep[slot] = (area[at] - was[at]) * inv;
      const gap = (TEETH - at) / SECTIONS;
      this.valveToTeeth[slot] = gap > 0 ? Math.exp(-gap / JET_REACH) : 0;
    }
    this.valves = n;
    // A junction that has just become a valve starts with no jet. The flow it carried the last
    // time it was one (perhaps wide open, hundreds of cm³/s) through the hair-thin gap of a
    // closing tongue would be a jet faster than sound, and its noise would drive the flow that
    // drives the noise: a blast at full scale as a k closes after "i".
    const now = this.isValveNow;
    now.fill(0);
    for (let v = 0; v < n; v++) now[this.valveAt[v]] = 1;
    for (let j = 0; j <= SECTIONS; j++) if (now[j] && !this.wasValve[j]) this.flowAt[j] = 0;
    this.wasValve.set(now);
  }

  /**
   * A valve: the flow u through a narrow gap between two slices.
   *   pressure before = 2·f − Zl·u      pressure after = 2·b + Zr·u
   *   before − after + hiss = drop·u·|u| + drag·u
   * a quadratic in u with one physical root. A shut gap has an enormous drop, so u = 0 and both
   * sides reflect completely.
   */
  private stepValves(parity: number): void {
    const { f, b, flowAt, hiss } = this;
    const slit = SLIT_DRAG * this.slice;
    let teeth = 0;
    for (let v = 0; v < this.valves; v++) {
      const j = this.valveAt[v];
      if ((j & 1) !== parity) continue;
      const gap = (this.valveGap[v] += this.valveGapStep[v]);
      const zl = IMPEDANCE / (this.valveLeft[v] += this.valveLeftStep[v]);
      const zr = IMPEDANCE / (this.valveRight[v] += this.valveRightStep[v]);
      const drop = DENSITY / (2 * gap * gap);
      const fi = f[j - 1];
      const bi = b[j];
      // Turbulence, from the flow a moment ago: nothing below the critical Reynolds number, then
      // rising toward a fixed fraction of the dynamic pressure of the jet (the form of Flanagan &
      // Cherry 1969: noise ∝ Re² − Re_critical²).
      const was = flowAt[j];
      const re = (REYNOLDS_PER_FLOW / Math.sqrt(gap)) * (was < 0 ? -was : was);
      let source = 0;
      if (re > REYNOLDS_CRITICAL) {
        const jet = drop * was * was * (1 - (REYNOLDS_CRITICAL * REYNOLDS_CRITICAL) / (re * re));
        source = HISS_AT_GAP * jet * this.coloured(v);
        teeth += jet * this.valveToTeeth[v];
        hiss[j] += 0.02 * (HISS_AT_GAP * jet - hiss[j]);
      }
      const drive = 2 * (fi - bi) + source;
      const linear = zl + zr + slit / (gap * gap * gap);
      const u = (2 * drive) / (linear + Math.sqrt(linear * linear + 4 * drop * (drive < 0 ? -drive : drive)));
      b[j - 1] = fi - zl * u;
      f[j] = bi + zr * u;
      flowAt[j] = u;
    }
    if (parity === 0) this.jetEven = teeth;
    else this.jetOdd = teeth;
  }

  /** The jet from a gap behind the teeth breaks on them: a noise source in the tube at the teeth. */
  private stepTeeth(): void {
    const jet = this.jetEven + this.jetOdd;
    if (jet <= 0) return;
    const source = HISS_AT_TEETH * jet * this.coloured(MAX_VALVES);
    this.f[TEETH] += source * this.teethFore;
    this.b[TEETH - 1] -= source * (1 - this.teethFore);
    this.hiss[TEETH] += 0.02 * (HISS_AT_TEETH * jet - this.hiss[TEETH]);
  }

  /**
   * The lips: a valve that opens into free air. The air outside loads the opening like a piston
   * in a wall: a resistance in parallel with a mass (Flanagan 1972),
   *   R = 128·ρc / (9π²·A)      L = 8ρ / (3π·sqrt(πA))
   * The mass is stepped by the trapezoid rule, holding its momentum (not its flow) so that lips
   * closing on it do no harm.
   */
  private stepLips(): void {
    const area = (this.lipArea += this.lipAreaStep);
    const zl = IMPEDANCE / area;
    const drop = DENSITY / (2 * area * area);
    const root = Math.sqrt(area);
    const fi = this.f[SECTIONS - 1];
    const was = this.lipFlow;
    const re = (REYNOLDS_PER_FLOW / root) * (was < 0 ? -was : was);
    let source = 0;
    if (re > REYNOLDS_CRITICAL) {
      const jet = HISS_AT_LIPS * drop * was * was * (1 - (REYNOLDS_CRITICAL * REYNOLDS_CRITICAL) / (re * re));
      source = jet * this.coloured(MAX_VALVES + 1);
      this.hiss[SECTIONS] += 0.02 * (jet - this.hiss[SECTIONS]);
    }
    const half = 0.5 * this.dt;
    const spring = PISTON_SPRING * root;
    const yields = 1 / (PISTON_ADMIT * area + half * spring);
    const flux = this.lipFlux + half * this.lipPressure;
    const past = spring * flux;
    const drive = 2 * fi + source + past * yields;
    const linear = zl + (SLIT_DRAG * this.slice) / (area * area * area) + yields;
    const u = (2 * drive) / (linear + Math.sqrt(linear * linear + 4 * drop * (drive < 0 ? -drive : drive)));
    const p = (u - past) * yields;
    this.b[SECTIONS - 1] = fi - zl * u;
    this.lipFlux = flux + half * p;
    this.lipPressure = p;
    this.lipFlow = u;
  }

  private shapeNose(slice: number): void {
    const area = this.noseArea;
    for (let k = 2; k < NOSE_SECTIONS; k++) {
      const left = area[k - 1];
      const right = area[k];
      if (k & 1) {
        const radius = Math.sqrt(Math.min(left, right) / Math.PI);
        const loss = Math.min(0.5, (4 * ROUGH_NOSE * KIRCHHOFF * slice) / radius);
        const through = left / (1 + loss);
        this.noseShare[k] = (2 * through) / (through + right);
        this.nosePass[k] = 1 / (1 + loss);
      } else {
        const surface = 2 * Math.sqrt(Math.PI * 0.5 * (left + right)) * 2 * slice;
        const give = IMPEDANCE * surface * this.wallGain;
        const all = left + right + give;
        this.noseShare[k] = (2 * left) / all;
        this.noseWall[k] = give / all;
      }
    }
  }

  private stepNose(parity: number): void {
    const f = this.noseF;
    const b = this.noseB;
    if (parity === 0) {
      const { noseShare, noseWall, noseWallPush, noseWallOut } = this;
      const dt = this.dt;
      for (let k = 2; k < NOSE_SECTIONS; k += 2) {
        const fi = f[k - 1];
        const bi = b[k];
        const s = noseShare[k];
        const w = noseWall[k];
        const push = noseWallPush[k];
        const p = s * fi + (2 - 2 * w - s) * bi - w * push;
        b[k - 1] = p - fi;
        f[k] = p - bi;
        const v = this.wallGain * (p + push);
        const out = (noseWallOut[k] += dt * v);
        noseWallPush[k] = this.wallInertia * v - WALL_SPRING * out;
      }
      // The nostrils: the same piston as the lips, always open.
      const fi = f[NOSE_SECTIONS - 1];
      const half = 0.5 * dt;
      const flux = this.nostrilFlux + half * this.nostrilPressure;
      const past = this.nostrilSpring * flux;
      const p = (2 * this.nostrilAdmit * fi - past) * this.nostrilYield;
      b[NOSE_SECTIONS - 1] = p - fi;
      this.nostrilFlux = flux + half * p;
      this.nostrilPressure = p;
      this.noseFlow = this.nostrilAdmit * (2 * fi - p);
      return;
    }
    // The port is a valve, so a nearly shut velum passes a trickle, not a wave.
    {
      const area = (this.portArea += this.portAreaStep);
      const zl = IMPEDANCE / area;
      const fi = f[0];
      const bi = b[1];
      const drive = 2 * (fi - bi);
      const linear = zl + this.portZr + (SLIT_DRAG * this.slice) / (area * area * area);
      const drop = DENSITY / (2 * area * area);
      const u = (2 * drive) / (linear + Math.sqrt(linear * linear + 4 * drop * (drive < 0 ? -drive : drive)));
      b[0] = fi - zl * u;
      f[1] = bi + this.portZr * u;
    }
    const { noseShare, nosePass } = this;
    for (let k = 3; k < NOSE_SECTIONS; k += 2) {
      const fi = f[k - 1];
      const bi = b[k];
      const s = noseShare[k];
      const p = s * fi + (2 - s) * bi;
      f[k] = p - bi;
      b[k - 1] = fi - nosePass[k] * (2 * fi - p);
    }
  }

  /** Follow the steady pressure in each slice and the power of the sound around it. */
  private watch(): void {
    const { f, b, steady, power } = this;
    const ks = this.watchSteady;
    const kp = this.watchPower;
    for (let j = 0; j < SECTIONS; j++) {
      const p = f[j] + b[j];
      const mean = (steady[j] += ks * (p - steady[j]));
      const ac = p - mean;
      power[j] += kp * (ac * ac - power[j]);
    }
    const nf = this.noseF;
    const nb = this.noseB;
    const ns = this.noseSteady;
    const np = this.nosePower;
    for (let k = 0; k < NOSE_SECTIONS; k++) {
      const p = nf[k] + nb[k];
      const mean = (ns[k] += ks * (p - ns[k]));
      const ac = p - mean;
      np[k] += kp * (ac * ac - np[k]);
    }
  }
}

/** Viscous drag of a slit one cm long is this over its area cubed (Poiseuille flow between plates). */
const SLIT_DRAG = 12 * VISCOSITY * SLIT_WIDTH * SLIT_WIDTH;
/** Reynolds number per unit of flow through a round gap is this over the root of its area: Re = ρ·v·d/μ. */
const REYNOLDS_PER_FLOW = ((DENSITY / VISCOSITY) * 2) / Math.sqrt(Math.PI);
/** The resistance of the piston is 1 / (this × area); the reciprocal of its mass is this × sqrt(area). */
const PISTON_ADMIT = (9 * Math.PI * Math.PI) / (128 * IMPEDANCE);
const PISTON_SPRING = (3 * Math.PI * Math.sqrt(Math.PI)) / (8 * DENSITY);
