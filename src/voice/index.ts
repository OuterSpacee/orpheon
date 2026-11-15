// One singer: lungs, folds, the air in the throat, mouth and nose, and the muscles that shape
// them. A Score or a live Pose in; sound and Telemetry out.
//
//   air.ts       the constants of the air
//   tube.ts      the air column (sound in a tube of changing shape, the nose, losses, hiss)
//   folds.ts     the vocal folds and the flow through them
//   shape.ts     the pose becomes a tube
//   inertia.ts   how fast each part of the body can move
//   phones.ts    what the body does for each sound      vowels.generated.ts  the fitted vowels
//   perform.ts   a Score becomes movement
//   resample.ts  from the simulation's rate to the device's
//   theory.ts    what a tube should do (for the fit and the tests; not used while rendering)
import { BODIES, NOSE_POINTS, POSE, POSE_COUNT, POSE_KEYS, REST, TELEMETRY as T, TRACT_POINTS } from "../contract.ts";
import type { Body, Pose, PoseKey, Score, Voice } from "../contract.ts";
import { lungPressure, SOUND } from "./air.ts";
import { Folds } from "./folds.ts";
import { ease } from "./inertia.ts";
import { plan } from "./perform.ts";
import type { Plan } from "./perform.ts";
import { Resampler } from "./resample.ts";
import { Noise } from "./rng.ts";
import { newAirway, noseAirway, shapeAirway } from "./shape.ts";
import { NOSE_SECTIONS, SECTIONS, Tube } from "./tube.ts";

/** Simulation samples between two updates of the pose and the tube's shape (about a third of a millisecond). */
const TICK = 16;
/** Sound pressure far from the mouth goes as the rate of change of the flow leaving it. This
 *  scales that to the -1..1 of an audio sample: a full sung vowel peaks near a half. */
const OUTPUT = 1 / 4.5e6;
/** The loudness (rms) Telemetry calls 1. */
const FULL_LEVEL = 0.16;
/** Sound pressure inside the tube that Telemetry shows as bright, dyn/cm². */
const BRIGHT = 900;
/** Noise pressure at its source that Telemetry shows as full, dyn/cm² (an s at the teeth is about this). */
const LOUD_HISS = 3000;
/** Glottal flow Telemetry calls 1, cm³/s. */
const STRONG_FLOW = 900;
/** Pressure behind a closure Telemetry calls 1, dyn/cm². */
const HELD_FULL = 9000;
/** Pose.pitch and Pose.lungs may be aimed anywhere; the rest are held to their meaning. */
const LOWEST = Float64Array.from(POSE_KEYS, (k) => (k === "lungs" || k === "larynx" ? -1 : k === "pitch" ? 30 : 0));
const HIGHEST = Float64Array.from(POSE_KEYS, (k) => (k === "pitch" ? 2000 : k === "vibrato" ? 200 : k === "lungs" ? 1.5 : 1));

/** The object createVoice returns: a Voice, plus a slow-motion recorder. */
export interface OrpheonVoice extends Voice {
  /**
   * Record the instantaneous sound pressure along the airway for the next `steps` simulation
   * steps (see replay). Each step is one sample of the simulation, a few tens of microseconds:
   * slow enough to watch one pulse from the folds travel up the throat.
   */
  record(steps: number): void;
  /**
   * The recording so far: `frames` consecutive steps of TRACT_POINTS pressures (dyn/cm², folds
   * to lips) in `pressure`, `seconds` apart. `frames` is 0 until record() has been called.
   */
  replay(): { pressure: Float32Array; frames: number; seconds: number };
}

class Singer implements OrpheonVoice {
  readonly sampleRate: number;
  private body: Body;
  private noise = new Noise(1);
  private tube = new Tube(this.noise);
  private folds = new Folds(this.noise);
  private resampler = new Resampler();
  private airway = newAirway();
  private nose = new Float64Array(NOSE_SECTIONS);

  private pose = new Float64Array(POSE_COUNT);
  private speed = new Float64Array(POSE_COUNT);
  private goal = new Float64Array(POSE_COUNT);
  /** Where aim() last pointed. */
  private live = new Float64Array(POSE_COUNT);

  private plans: { at: number; plan: Plan }[] = [];
  private phone = -1;

  private rendered = 0;
  private simTime = 0;
  private untilTick = 0;
  private stretch = 1.2;
  private lastFlow = 0;
  private loud = 0;
  private held = 0;

  private tape = new Float32Array(0);
  private tapeFrames = 0;
  private tapeWanted = 0;
  private tapeStep = 0;

  constructor(sampleRate: number, body: Body) {
    this.sampleRate = sampleRate;
    this.body = { tract: 17.5, folds: 0.5 };
    POSE_KEYS.forEach((k, i) => (this.pose[i] = this.goal[i] = this.live[i] = REST[k]));
    this.pose[POSE.pitch] = Math.log2(REST.pitch);
    this.setBody(body);
    shapeAirway(this.pose, this.body, this.airway);
    this.tube.shape(this.airway.area, this.airway.port, this.airway.length / SECTIONS, 1);
    this.tube.shape(this.airway.area, this.airway.port, this.airway.length / SECTIONS, 1);
  }

  get time(): number {
    return this.rendered / this.sampleRate;
  }

  setBody(body: Body): void {
    // Any human size, and a little beyond; never a length the simulation cannot hold.
    const tract = Number.isFinite(body.tract) ? Math.min(24, Math.max(8, body.tract)) : 17.5;
    const folds = Number.isFinite(body.folds) ? Math.min(1, Math.max(0, body.folds)) : 0.5;
    this.body = { tract, folds };
    this.noise.reseed(Math.round(tract * 1000) * 31 + Math.round(folds * 1000) + 1);
    this.folds.setBody(folds);
    noseAirway(this.body, this.nose);
    this.tube.setNose(this.nose);
  }

  aim(pose: Partial<Pose>): void {
    for (const key in pose) {
      const k = POSE[key as PoseKey];
      const v = pose[key as PoseKey];
      if (k === undefined || typeof v !== "number" || !Number.isFinite(v)) continue;
      this.live[k] = v < LOWEST[k] ? LOWEST[k] : v > HIGHEST[k] ? HIGHEST[k] : v;
    }
  }

  perform(score: Score, at: number = this.time): void {
    const plans = this.plans;
    for (let i = plans.length - 1; i >= 0; i--) if (plans[i].at >= at) plans.splice(i, 1);
    plans.push({ at, plan: plan(score, this.body) });
  }

  hush(): void {
    this.plans.length = 0;
    POSE_KEYS.forEach((k, i) => (this.live[i] = REST[k]));
  }

  render(out: Float32Array): void {
    const { resampler, sampleRate } = this;
    for (let i = 0; i < out.length; i++) {
      const when = this.rendered / sampleRate;
      while (this.simTime < when + resampler.reach(this.stretch) * this.tube.dt) this.step();
      const at = resampler.count - 1 - (this.simTime - when) / this.tube.dt;
      const x = resampler.read(at, this.stretch);
      // A shout may pass 1; round it off rather than clip it.
      const big = x < 0 ? -x : x;
      out[i] = big < 0.7 ? x : (x < 0 ? -1 : 1) * (0.7 + 0.3 * Math.tanh((big - 0.7) / 0.3));
      this.rendered++;
    }
  }

  /** One sample of the simulation. */
  private step(): void {
    if (this.untilTick === 0) {
      this.control();
      this.untilTick = TICK;
    }
    this.untilTick--;
    const { tube, folds } = this;
    const back = tube.b[0];
    tube.f[0] = back + tube.entry * folds.step(tube.dt, back, tube.entry);
    tube.step();
    const flow = tube.lipFlow + tube.noseFlow + tube.wallFlow;
    const sound = ((flow - this.lastFlow) / tube.dt) * OUTPUT;
    this.lastFlow = flow;
    this.loud += 40 * tube.dt * (sound * sound - this.loud);
    this.resampler.push(sound);
    this.simTime += tube.dt;
    if (this.tapeFrames < this.tapeWanted) this.tapeFrame();
  }

  /** Once per tick: where the body is aimed, how far it has got, and the tube that makes. */
  private control(): void {
    const { tube, folds, pose, goal } = this;
    const h = TICK * tube.dt;

    this.phone = -1;
    const active = this.activePlan();
    if (active) this.phone = active.plan.aim(this.simTime - active.at, goal);
    else goal.set(this.live);
    // A score may carry anything; a value that is not a number is not followed.
    for (let k = 0; k < POSE_COUNT; k++) if (!(goal[k] > -1e6 && goal[k] < 1e6)) goal[k] = this.live[k];
    if (!(goal[POSE.pitch] >= 30)) goal[POSE.pitch] = 30;
    if (goal[POSE.pitch] > 2000) goal[POSE.pitch] = 2000;
    // Pitch moves evenly in musical pitch, so its inertia works on the logarithm.
    goal[POSE.pitch] = Math.log2(goal[POSE.pitch]);
    ease(pose, this.speed, goal, h);

    // A simulation that has gone wrong must not stay wrong: clear the air and carry on.
    if (!(this.lastFlow > -1e9 && this.lastFlow < 1e9)) {
      tube.clear();
      folds.clear();
      this.resampler.clear();
      this.lastFlow = 0;
      this.loud = 0;
    }

    shapeAirway(pose, this.body, this.airway);
    const slice = this.airway.length / SECTIONS;
    tube.shape(this.airway.area, this.airway.port, slice, TICK);
    this.stretch = this.resampler.stretchFor(SOUND / (2 * slice), this.sampleRate);

    folds.lung = lungPressure(pose[POSE.lungs]);
    folds.pitch = Math.pow(2, pose[POSE.pitch]);
    folds.gap = pose[POSE.glottis];
    folds.register = pose[POSE.register];
    folds.vibrato = pose[POSE.vibrato];
    folds.tick(h, TICK);
    this.holdPressure();
  }

  private activePlan(): { at: number; plan: Plan } | null {
    const plans = this.plans;
    let found = null;
    for (let i = 0; i < plans.length; i++) if (plans[i].at <= this.simTime) found = plans[i];
    if (found && this.simTime - found.at > found.plan.length) return null;
    return found;
  }

  /** The pressure behind the tightest place in the mouth, if it is shut. */
  private holdPressure(): void {
    const area = this.airway.area;
    let tight = 8;
    for (let j = 9; j < SECTIONS; j++) if (area[j] < area[tight]) tight = j;
    const size = this.body.tract / 17.5;
    const shut = 1 - area[tight] / (0.03 * size * size);
    const behind = this.tube.steady[tight - 2] / HELD_FULL;
    const now = shut > 0 && behind > 0 ? (behind > 1 ? 1 : behind) * shut : 0;
    this.held += 0.2 * (now - this.held);
  }

  sense(into: Float32Array): void {
    const { tube, folds, pose, airway } = this;
    into[T.time] = this.time;
    const level = Math.sqrt(this.loud) / FULL_LEVEL;
    into[T.level] = level > 1 ? 1 : level;
    into[T.f0] = folds.swing > 0.05 ? folds.sounding : 0;
    into[T.voiced] = folds.swing;
    into[T.foldPhase] = folds.phase;
    const open = folds.meanArea / folds.wide;
    into[T.foldOpen] = open > 1 ? 1 : open;
    const flow = folds.meanFlow / STRONG_FLOW;
    into[T.flow] = flow > 1 ? 1 : flow < -1 ? -1 : flow;
    into[T.lung] = pose[POSE.lungs];
    into[T.phone] = this.phone;
    into[T.held] = this.held;
    for (let k = 0; k < POSE_COUNT; k++) into[T.pose + k] = pose[k];
    into[T.pose + POSE.pitch] = Math.pow(2, pose[POSE.pitch]);

    for (let i = 0; i < TRACT_POINTS; i++) {
      // Point i sits at i/(points−1) of the length; slice j is centred at (j+½)/SECTIONS.
      const at = (i / (TRACT_POINTS - 1)) * SECTIONS - 0.5;
      const j = at <= 0 ? 0 : at >= SECTIONS - 1 ? SECTIONS - 2 : Math.floor(at);
      const mix = at <= 0 ? 0 : at >= SECTIONS - 1 ? 1 : at - j;
      // A slice that is shut shows as shut, not as half its open neighbour.
      const shut = airway.area[j] < 1e-4 || airway.area[j + 1] < 1e-4;
      into[T.area + i] = shut ? 0 : airway.area[j] + (airway.area[j + 1] - airway.area[j]) * mix;
      const power = tube.power[j] + (tube.power[j + 1] - tube.power[j]) * mix;
      into[T.pressure + i] = 1 - Math.exp(-Math.sqrt(power > 0 ? power : 0) / BRIGHT);
      const junction = Math.round((i / (TRACT_POINTS - 1)) * SECTIONS);
      const hiss = (junction === 0 ? folds.hiss : tube.hiss[junction]) / LOUD_HISS;
      into[T.noise + i] = hiss > 1 ? 1 : Math.sqrt(hiss > 0 ? hiss : 0);
    }
    for (let i = 0; i < NOSE_POINTS; i++) {
      const at = (i / (NOSE_POINTS - 1)) * (NOSE_SECTIONS - 1);
      const k = at >= NOSE_SECTIONS - 1 ? NOSE_SECTIONS - 2 : Math.floor(at);
      const mix = at - k;
      const here = k === 0 ? airway.port : this.nose[k];
      into[T.noseArea + i] = here + (this.nose[k + 1] - here) * mix;
      const power = tube.nosePower[k] + (tube.nosePower[k + 1] - tube.nosePower[k]) * mix;
      into[T.nosePressure + i] = airway.port > 0 ? 1 - Math.exp(-Math.sqrt(power > 0 ? power : 0) / BRIGHT) : 0;
    }
  }

  record(steps: number): void {
    const frames = Math.max(0, Math.min(8192, Math.floor(steps)));
    if (this.tape.length < frames * TRACT_POINTS) this.tape = new Float32Array(frames * TRACT_POINTS);
    this.tapeFrames = 0;
    this.tapeWanted = frames;
    this.tapeStep = this.tube.dt;
  }

  replay(): { pressure: Float32Array; frames: number; seconds: number } {
    return { pressure: this.tape, frames: this.tapeFrames, seconds: this.tapeStep };
  }

  /** One frame of the slow-motion recording: the pressure in every slice, less its steady part. */
  private tapeFrame(): void {
    const { tube, tape } = this;
    const base = this.tapeFrames++ * TRACT_POINTS;
    for (let i = 0; i < TRACT_POINTS; i++) {
      const at = (i / (TRACT_POINTS - 1)) * SECTIONS - 0.5;
      const j = at <= 0 ? 0 : at >= SECTIONS - 1 ? SECTIONS - 2 : Math.floor(at);
      const mix = at <= 0 ? 0 : at >= SECTIONS - 1 ? 1 : at - j;
      const a = tube.f[j] + tube.b[j] - tube.steady[j];
      const b = tube.f[j + 1] + tube.b[j + 1] - tube.steady[j + 1];
      tape[base + i] = a + (b - a) * mix;
    }
  }
}

export function createVoice(sampleRate: number, body: Body = BODIES.tenor): OrpheonVoice {
  return new Singer(sampleRate, body);
}
