// Motion for the video: the heads move as singers do, and the eye moves as a camera operator
// would, both from what the voices are doing (docs/look.md: nothing moves that the sound does
// not move, except a slow breath).
//
//   heads   each head breathes (a slow sway and turn), nods a little as each new syllable
//           starts, lifts its chin a touch on a high note and drops it on a low one, and,
//           while another sings and it does not, turns a little toward the one singing
//   camera  still; breathe (a slow drift); cinematic (a song's camera is directed from the
//           song itself, shot by shot: director.ts; with no song to follow, held shots of
//           whoever sings, the group wide, a slow arc and push-in, two-second moves); follow
//           (leans toward whoever sings); orbit (a slow arc around the choir); close
//           (close-ups). Every shot is held at least MIN_SHOT seconds and taken only once who
//           sings has settled, so the camera never darts; the view keeps the shot in the frame.
//
// Everything is stepped by dt from telemetry, and a directed camera is read off the song's clock:
// a fast recording drawn at a fixed step moves the same every time. Only the choice of a random
// motion uses chance, once, when it is chosen.
import { cutBetween, makeTake, takeAt } from "./director.ts";
import type { Plan } from "./director.ts";

export type CameraMove = "still" | "breathe" | "cinematic" | "follow" | "orbit" | "close";

/** The shortest a shot is held, in seconds: the camera does not cut on every syllable. */
const MIN_SHOT = 4;

export interface MotionSpec {
  /** How much the heads move, 0 still .. 1 fully. */
  heads: number;
  camera: CameraMove;
  /** How far the camera goes, 0..1. */
  strength: number;
  /** Seconds a slow camera cycle takes. */
  period: number;
  /** Where in its cycles each motion starts. */
  seed: number;
}

export const MOTIONS: readonly { id: string; name: string; use: string; spec: MotionSpec }[] = [
  { id: "still", name: "Still", use: "The heads and the camera at rest", spec: { heads: 0, camera: "still", strength: 0, period: 20, seed: 1 } },
  { id: "cinematic", name: "Cinematic", use: "Directed from the song: the choir wide, a push-in on each voice that comes in, duets together, a low angle at the climax, rising at the end", spec: { heads: 1, camera: "cinematic", strength: 0.7, period: 20, seed: 6 } },
  { id: "natural", name: "Natural", use: "The singers move as they sing; the camera breathes", spec: { heads: 1, camera: "breathe", strength: 0.6, period: 18, seed: 2 } },
  { id: "follow", name: "Follow", use: "The camera leans toward whoever leads", spec: { heads: 1, camera: "follow", strength: 0.7, period: 18, seed: 3 } },
  { id: "orbit", name: "Orbit", use: "A slow arc around the choir", spec: { heads: 0.8, camera: "orbit", strength: 0.7, period: 30, seed: 4 } },
  { id: "close", name: "Close-ups", use: "Close on whoever leads, wide when all sing", spec: { heads: 1, camera: "close", strength: 0.8, period: 18, seed: 5 } },
];

/** A motion made up from a number: any camera move, strengths and pace within what looks right. */
export function randomMotion(seed: number): MotionSpec {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cameras: CameraMove[] = ["cinematic", "breathe", "follow", "orbit", "close"];
  return {
    heads: 0.6 + 0.4 * next(),
    camera: cameras[Math.floor(next() * cameras.length)],
    strength: 0.35 + 0.6 * next(),
    period: 14 + 22 * next(),
    seed: Math.floor(next() * 1e6),
  };
}

/** What one head is doing, as the motion needs it. */
export interface HeadInput {
  /** Is it on the stage, and where (stage cm). */
  here: boolean;
  x: number;
  /** Its loudness 0..1 and pitch in Hz (0 silent). */
  level: number;
  f0: number;
}

/** One head's movement, in radians: chin up (+) or down, tilt toward a shoulder, and an extra turn. */
export interface HeadPose {
  nod: number;
  tilt: number;
  turn: number;
}

/**
 * What the camera adds this frame: a turn and a lean of the eye (radians), a zoom factor, and how
 * far to look toward the heads singing now (0 the group .. 1 them), each by its weight in `focus`.
 */
export interface CameraPose {
  yaw: number;
  pitch: number;
  zoom: number;
  toward: number;
  focus: Float32Array;
  /**
   * Directed from a song's shot list (director.ts): the view then frames the shot itself, `tight`
   * (how close, as large as the frame holds the shot's heads at 1), `pivot` (the eye circling them
   * rather than the choir) and `detail` (in on the throat) in place of `zoom`; `cut` is set on the
   * frame a shot is cut into, so the view frames it at once instead of easing there.
   */
  directed: boolean;
  tight: number;
  pivot: number;
  detail: number;
  cut: boolean;
}

const TAU = Math.PI * 2;

/** A spring that settles critically: it follows its goal without overshoot unless kicked. */
class Spring {
  v = 0;
  x = 0;
  step(goal: number, dt: number, time: number): number {
    const w = 2 / Math.max(0.05, time);
    const a = w * w * (goal - this.x) - 2 * w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Motion {
  private spec: MotionSpec = MOTIONS[0].spec;
  private t = 0;
  private nod: Spring[] = [];
  private tilt: Spring[] = [];
  private turn: Spring[] = [];
  private loud: number[] = [];
  private pitch: number[] = [];
  private lead = -1;
  private leadFor = 0;
  private yaw = new Spring();
  private lean = new Spring();
  private zoom = new Spring();
  private toward = new Spring();
  readonly heads: HeadPose[] = [];
  readonly camera: CameraPose = { yaw: 0, pitch: 0, zoom: 1, toward: 0, focus: new Float32Array(8), directed: false, tight: 0, pivot: 0, detail: 0, cut: false };
  /** The song's shot list, and the song's clock at the last directed frame. */
  private plan: Plan | null = null;
  private take = makeTake();
  private clock = NaN;
  /** Each head's share of the camera's attention, eased so a shot changes smoothly. */
  private attention: number[] = [];
  /** Seconds since each head last sang; the shot (who it shows), how long it has been held, and who is waiting to be shown. */
  private heard: number[] = [];
  private shot: number[] = [];
  private shotKey = "";
  private shotFor = 99;
  private pendingKey = "";
  private pendingFor = 0;

  constructor() {
    this.zoom.x = 1;
  }

  set(spec: MotionSpec | null): void {
    this.spec = spec ?? MOTIONS[0].spec;
  }

  /** The song's shot list (null: none, the camera follows the voices as they are heard). */
  direct(plan: Plan | null): void {
    this.plan = plan;
    this.clock = NaN;
  }

  /** Does the camera follow a shot list now? */
  directs(clock: number | null): boolean {
    return !!this.plan && this.spec.camera === "cinematic" && clock !== null && Number.isFinite(clock);
  }

  get moving(): boolean {
    return this.spec.heads > 0 || this.spec.camera !== "still";
  }

  /**
   * Step every head and the camera by dt seconds. `clock` is seconds into the song being
   * performed (null: none), which a directed camera reads its shot from.
   */
  step(dt: number, heads: readonly HeadInput[], clock: number | null = null): void {
    const s = this.spec;
    this.t += dt;
    const t = this.t + (s.seed % 997);
    const n = heads.length;

    // Who leads: the loudest singer, kept until another has been clearly louder for a moment,
    // so the camera does not dart between voices on every syllable.
    let loudest = -1;
    let most = 0.04;
    heads.forEach((h, i) => {
      if (h.here && h.level > most) {
        most = h.level;
        loudest = i;
      }
    });
    if (loudest !== this.lead && (this.lead < 0 || !heads[this.lead]?.here || most > 1.4 * (heads[this.lead]?.level ?? 0))) {
      this.leadFor += dt;
      if (this.leadFor > 0.8 || this.lead < 0) {
        this.lead = loudest;
        this.leadFor = 0;
      }
    } else this.leadFor = 0;

    for (let i = 0; i < n; i++) {
      const h = heads[i];
      this.nod[i] ??= new Spring();
      this.tilt[i] ??= new Spring();
      this.turn[i] ??= new Spring();
      const was = this.loud[i] ?? 0;
      this.loud[i] = h.level;
      const k = s.heads;
      const phase = i * 1.7 + (s.seed % 13);
      // a syllable starts: a small nod, the head dipping into it and coming back
      if (h.level > 0.08 && was <= 0.05) this.nod[i].v -= 0.35 * k;
      // the chin with the pitch, around the singer's own middle: a touch up on high notes
      if (h.f0 > 40) this.pitch[i] = this.pitch[i] ? this.pitch[i] + (Math.log2(h.f0) - this.pitch[i]) * Math.min(1, dt / 4) : Math.log2(h.f0);
      const high = h.f0 > 40 && this.pitch[i] ? Math.max(-1, Math.min(1, Math.log2(h.f0) - this.pitch[i])) : 0;
      const breath = Math.sin((TAU * t) / 5.3 + phase);
      const nodGoal = k * (0.06 * high * Math.min(1, h.level * 3) + 0.012 * breath);
      const tiltGoal = k * (0.035 * Math.sin((TAU * t) / 7.9 + phase) + 0.02 * Math.min(1, h.level * 2) * Math.sin((TAU * t) / 3.1 + phase));
      // listening: a quiet head turns a little toward the one singing
      let turnGoal = k * 0.05 * Math.sin((TAU * t) / 9.7 + phase);
      if (this.lead >= 0 && this.lead !== i && h.level < 0.03 && heads[this.lead]?.here) turnGoal += k * 0.12 * Math.sign(heads[this.lead].x - h.x);
      this.heads[i] = {
        nod: this.nod[i].step(nodGoal, dt, 0.35),
        tilt: this.tilt[i].step(tiltGoal, dt, 0.8),
        turn: this.turn[i].step(turnGoal, dt, 1.1),
      };
    }

    if (this.directs(clock)) return this.directed(clock!);
    this.camera.directed = false;
    this.camera.cut = false;
    this.clock = NaN;

    // The camera works in shots, as an operator does: who is singing is noticed (a voice that
    // stopped still counts for a breath), a new shot is taken only once that has settled and the
    // last shot has been held long enough, and every move between shots is slow.
    const P = Math.max(6, s.period);
    const g = s.strength;
    for (let i = 0; i < this.camera.focus.length; i++) {
      const h = heads[i];
      this.heard[i] = h && h.here && h.level > 0.04 ? 0 : (this.heard[i] ?? 99) + dt;
    }
    const now = heads.map((h, i) => (h.here && this.heard[i] < 0.9 ? i : -1)).filter((i) => i >= 0);
    const key = now.join(",");
    this.shotFor += dt;
    if (key !== this.shotKey) {
      this.pendingFor = key === this.pendingKey ? this.pendingFor + dt : 0;
      this.pendingKey = key;
      if (this.pendingFor > 1.1 && this.shotFor > MIN_SHOT) {
        this.shotKey = key;
        this.shotFor = 0;
        this.shot = now;
      }
    }
    const inShot = this.shot.length;
    // A soloist close, a duet together, three or more (or no one) wide: the group.
    const group = inShot === 0 || inShot >= 3 || n < 2;
    const size = inShot === 1 ? 1 : inShot === 2 ? 0.55 : 0;
    // Within a shot the camera creeps in, a little, for as long as it is held.
    const creep = 1 + 0.06 * g * Math.min(1, this.shotFor / 12);
    let yaw = 0, lean = 0, zoom = 1, toward = 0;
    switch (s.camera) {
      case "breathe":
        yaw = 0.08 * g * Math.sin((TAU * t) / P);
        lean = 0.03 * g * Math.sin((TAU * t) / (P * 1.3) + 1);
        zoom = 1 + 0.04 * g * Math.sin((TAU * t) / (P * 0.8) + 2);
        break;
      case "orbit":
        yaw = 0.5 * g * Math.sin((TAU * t) / P);
        lean = 0.06 * g * Math.sin((TAU * t) / (P * 0.5));
        zoom = 1 + 0.05 * g * Math.cos((TAU * t) / P);
        break;
      case "cinematic":
        // a slow arc as on a dolly, a medium shot of whoever sings, the group wide, always creeping in
        yaw = 0.11 * g * Math.sin((TAU * t) / (P * 1.4));
        lean = 0.025 * g * Math.sin((TAU * t) / (P * 1.9) + 1);
        toward = group ? 0 : 0.85;
        zoom = creep * (1 + (group ? 0 : (0.18 + 0.32 * g) * size));
        break;
      case "follow":
        yaw = 0.05 * g * Math.sin((TAU * t) / P);
        toward = group ? 0 : 0.5 * g;
        zoom = creep * (1 + (group ? 0 : 0.2 * g * size));
        break;
      case "close":
        toward = group ? 0 : 0.95;
        zoom = creep * (1 + (group ? 0 : (0.3 + 0.7 * g) * size));
        yaw = 0.06 * g * Math.sin((TAU * t) / P);
        break;
    }
    // the moves between shots take about two seconds, eased in and out
    this.camera.yaw = this.yaw.step(yaw, dt, 2.4);
    this.camera.pitch = this.lean.step(lean, dt, 2.4);
    this.camera.zoom = this.zoom.step(zoom, dt, 2.0);
    this.camera.toward = this.toward.step(toward, dt, 2.0);
    // Attention: on the shot's voices, eased, so the frame glides to them.
    let total = 0;
    for (let i = 0; i < this.camera.focus.length; i++) {
      const goal = this.shot.includes(i) ? 1 : 0;
      const was = this.attention[i] ?? 0;
      this.attention[i] = was + (goal - was) * (1 - Math.exp(-dt / 0.9));
      total += this.attention[i];
    }
    for (let i = 0; i < this.camera.focus.length; i++) this.camera.focus[i] = total > 1e-6 ? (this.attention[i] ?? 0) / total : 0;
  }

  /** The camera from the song's shot list at this moment of the song. */
  private directed(clock: number): void {
    const plan = this.plan!;
    const take = this.take;
    takeAt(plan, clock, take);
    const c = this.camera;
    // A cut, or the first directed frame, or the song started again: framed at once.
    c.cut = !Number.isFinite(this.clock) || clock < this.clock - 0.25 || cutBetween(plan, this.clock, clock);
    this.clock = clock;
    c.directed = true;
    c.yaw = take.yaw;
    c.pitch = take.pitch;
    c.zoom = 1;
    c.tight = take.tight;
    c.toward = take.toward;
    c.pivot = take.pivot;
    c.detail = take.detail;
    c.focus.set(take.focus.subarray(0, c.focus.length));
    // The springs are kept where the camera is, so a camera that stops being directed eases from here.
    for (const [spring, x] of [[this.yaw, c.yaw], [this.lean, c.pitch], [this.zoom, 1], [this.toward, 0]] as const) {
      spring.x = x;
      spring.v = 0;
    }
    for (let i = 0; i < c.focus.length; i++) this.attention[i] = c.focus[i];
  }
}
