// From the voice's telemetry to what the graphics card needs each frame: one small texture with
// the airway, the nose and the soft palate as they are now, and a few numbers (the jaw's turn,
// where the folds are in their slowed cycle, how far the air has travelled).
//
// Nothing here allocates once it is made.
import { NOSE_POINTS, POSE, TELEMETRY as T, TELEMETRY_SIZE } from "../contract.ts";
import { LIP_LINE, MOUTH_HALF, VELUM_POINTS, jawTurn, makeVelum, noseReach, noseTall, noseX, noseY, shapeVelum, swingX, swingY, velumHalf, velumThick } from "./body.ts";
import { clamp, curve, mix, smoothstep } from "./curve.ts";
import { N, along, larynxLift, lipHalfWidth, lipReach, liftShare, makeAirway, restingArea, shapeAirway, type Airway } from "./tract.ts";

/** Rows of the body texture; each is N texels of four numbers. */
export const BODY_ROWS = 7;
// row 0  roof x, roof y, across x, across y
// row 1  gap, half-width of the lens, arch of the roof, heat (how loud the air is there)
// row 2  hiss, floor of the mouth x, y (where the tongue's underside is anchored), half-width of the tongue
// row 3  the nose's line x, y, how tall the passage is, how far it is open sideways
// row 4  heat in the nose, loudness that left the mouth a while ago, the soft palate's underside x, y
// row 5  the soft palate's up direction x, y, its thickness, its half-width
// row 6  the nose's across direction x, y

/** The tongue runs along this much of the airway: from its root above the larynx to its tip behind the teeth. */
export const TONGUE_FROM = 0.15;
export const TONGUE_TO = 0.93;
/** Where the underside of the tongue is anchored, by position along the airway: from the bone under the tongue's root to the floor of the mouth behind the lower teeth. */
const floorRestX = curve([0.15, 1.75, 0.3, 2.4, 0.5, 3.9, 0.7, 5.6, 0.85, 6.9, 0.93, 7.55]);
const floorRestY = curve([0.15, -5.3, 0.3, -5.0, 0.5, -4.3, 0.7, -3.4, 0.85, -2.4, 0.93, -1.3]);
/** Half the tongue's width along its length. */
export const tongueHalf = curve([0.15, 1.3, 0.3, 1.7, 0.5, 2.2, 0.75, 2.3, 0.86, 1.9, 0.93, 1.1]);

/** How fast the rings of sound travel outward, in cm a second (slow enough to watch), and how far they get. */
const RING_SPEED = 20;
const RING_REACH = 30;
/** How long the sound in front of the mouth is remembered, in seconds: the time a ring takes to fade. */
const ECHO = RING_REACH / RING_SPEED;
/** How many times a second the slowed folds open and close. */
const STROBE = 1.4;

export interface Moving {
  /** The latest telemetry, eased so that a slow feed still moves smoothly. */
  now: Float32Array;
  airway: Airway;
  /** The body texture's contents: BODY_ROWS × N × 4. */
  body: Float32Array;
  jawCos: number;
  jawSin: number;
  lipDrop: number;
  lipWidth: number;
  lipReach: number;
  lift: number;
  strobe: number;
  voiced: number;
  foldsApart: number;
  airTravel: number;
  noseTravel: number;
  noseOpen: number;
  held: number;
  heldAt: number;
  lungSize: number;
  lungPressure: number;
  lungTravel: number;
  ripple: number;
  ripplesPerCm: number;
  hiss: number;
  mouthX: number;
  mouthY: number;
  mouthHalf: number;
  mouthShare: number;
  sparks: number;
}

export function makeMoving(): Moving & { take(telemetry: Float32Array): void; step(dt: number): void } {
  const target = new Float32Array(TELEMETRY_SIZE);
  const now = new Float32Array(TELEMETRY_SIZE);
  // Before any telemetry: the body at rest, breathing, silent.
  for (let i = 0; i < N; i++) target[T.area + i] = restingArea(along(i));
  target[T.pose + POSE.jaw] = 0.25;
  target[T.pose + POSE.lips] = 0.5;
  target[T.pose + POSE.velum] = 1;
  target[T.foldOpen] = 1;
  now.set(target);

  const airway = makeAirway();
  const velum = makeVelum();
  const body = new Float32Array(BODY_ROWS * N * 4);
  const echo = new Float32Array(N);
  const echoNext = new Float32Array(N);
  let lastTime = -1;
  let lastPhase = 0;
  let lastPitch = 0;
  let fresh = false;

  const m = {
    now, airway, body,
    jawCos: 1, jawSin: 0, lipDrop: 0, lipWidth: 1, lipReach: 0, lift: 0,
    strobe: 0, voiced: 0, foldsApart: 1,
    airTravel: 0, noseTravel: 0, noseOpen: 0, held: 0, heldAt: 1,
    lungSize: 1, lungPressure: 0, lungTravel: 0,
    ripple: 0, ripplesPerCm: 0.25, hiss: 0,
    mouthX: 9.3, mouthY: -0.3, mouthHalf: 1, mouthShare: 1, sparks: 0,

    take(telemetry: Float32Array) {
      // Copied, never kept: the page hands over the same array every time, rewritten in place.
      const n = Math.min(TELEMETRY_SIZE, telemetry.length);
      for (let i = 0; i < n; i++) target[i] = telemetry[i];
      fresh = true;
    },

    step(dt: number) {
      // Ease toward the newest telemetry. The voice has already given the body its inertia;
      // this only bridges the gaps between deliveries.
      const ease = 1 - Math.exp(-dt / 0.03);
      for (let i = 0; i < TELEMETRY_SIZE; i++) {
        const v = target[i];
        now[i] = Number.isFinite(v) ? now[i] + (v - now[i]) * ease : now[i];
      }
      const pose = T.pose;
      const round = now[pose + POSE.round];
      shapeAirway(airway, now, T.area, now[pose + POSE.larynx], round);
      shapeVelum(velum, now[pose + POSE.velum]);

      // The jaw, and the lower lip riding on it: the lip must end up where the tube's last
      // cross-section says the opening is, whatever the jaw alone would do.
      const turn = jawTurn(now[pose + POSE.jaw]);
      m.jawCos = Math.cos(turn);
      m.jawSin = Math.sin(turn);
      const last = N - 1;
      const wanted = airway.roofY[last] - airway.gap[last];
      m.lipDrop = wanted - swingY(LIP_LINE[0], LIP_LINE[1], turn);
      m.lipWidth = lipHalfWidth(round) / MOUTH_HALF;
      m.lipReach = lipReach(round);
      m.lift = larynxLift(now[pose + POSE.larynx]);
      m.mouthX = airway.roofX[last] + 0.35;
      m.mouthY = airway.roofY[last] - airway.gap[last] * 0.5;
      m.mouthHalf = airway.half[last];

      // The folds, as a stroboscope shows them. Their true phase and pitch tell how far the cycle
      // really moved since the last frame; taking away all but a slow remainder leaves a cycle
      // the eye can follow. If the two disagree (a jump in pitch, a late frame) the slow cycle
      // just keeps its pace.
      const time = target[T.time];
      const span = lastTime >= 0 ? time - lastTime : 0;
      const pitch = target[T.f0];
      m.voiced = now[T.voiced];
      if (fresh && span > 0 && span < 0.2 && pitch > 0 && lastPitch > 0) {
        const flash = (pitch + lastPitch) * 0.5 - STROBE;
        let moved = target[T.foldPhase] - lastPhase - flash * span;
        moved -= Math.round(moved);
        m.strobe += Math.abs(moved - STROBE * span) < 0.08 ? moved : STROBE * span;
      } else if (m.voiced > 0.02) {
        m.strobe += STROBE * (fresh ? Math.max(span, 0) : dt);
      }
      m.strobe -= Math.floor(m.strobe);
      if (fresh) {
        lastTime = time;
        lastPhase = target[T.foldPhase];
        lastPitch = pitch;
        fresh = false;
      }
      m.foldsApart = smoothstep(0.42, 1, now[T.foldOpen]);

      // The air travels with the flow. The nose's air only travels while the nose is open.
      const flow = now[T.flow];
      const port = Math.min(now[T.noseArea], now[T.noseArea + 1]);
      m.noseOpen = smoothstep(0.0, 0.25, port);
      m.airTravel = wrap(m.airTravel + flow * 0.5 * dt);
      m.noseTravel = wrap(m.noseTravel + flow * 0.5 * m.noseOpen * dt);

      // Pressure packed behind a closure: find where the tube is shut.
      let tight = N - 1;
      for (let i = Math.round(0.4 * (N - 1)); i < N; i++) if (now[T.area + i] < now[T.area + tight]) tight = i;
      const shut = 1 - smoothstep(0.02, 0.12, now[T.area + tight]);
      if (shut > 0.5) m.heldAt = along(tight);
      m.held = clamp(now[T.held], 0, 1) * shut;

      // The lungs empty as air leaves and fill again on the in-breath, or at rest.
      m.lungPressure = clamp(now[T.lung], 0, 1);
      if (flow > 0.01) m.lungSize -= flow * 0.07 * dt;
      else if (flow < -0.01) m.lungSize -= flow * 0.6 * dt;
      else if (m.lungPressure < 0.05) m.lungSize += 0.3 * dt;
      m.lungSize = clamp(m.lungSize, 0.72, 1);
      m.lungTravel = wrap(m.lungTravel + flow * 0.9 * dt);

      // Sound in front of the mouth. Rings leave at a fixed pace; a higher note packs them closer.
      if (now[T.f0] > 30) m.ripplesPerCm += (clamp(Math.sqrt(now[T.f0]) / 42, 0.2, 0.85) - m.ripplesPerCm) * (1 - Math.exp(-dt / 0.08));
      m.ripple = wrap(m.ripple + RING_SPEED * m.ripplesPerCm * dt);
      let hiss = 0;
      for (let i = 0; i < N; i++) hiss = Math.max(hiss, now[T.noise + i]);
      m.hiss = clamp(hiss * (1 - 0.7 * m.voiced), 0, 1);
      const lips = now[T.area + last];
      const nostrils = Math.min(port, now[T.noseArea + NOSE_POINTS - 1]);
      m.mouthShare = lips + nostrils > 1e-4 ? lips / (lips + nostrils) : 1;
      m.sparks = wrap(m.sparks + dt);

      // The loudness that left a while ago is further out by now: slide the memory outward.
      const shift = (dt / ECHO) * (N - 1);
      for (let i = 0; i < N; i++) {
        const from = i - shift;
        if (from <= 0) echoNext[i] = now[T.level];
        else {
          const k = Math.floor(from);
          echoNext[i] = mix(echo[k], echo[Math.min(N - 1, k + 1)], from - k);
        }
      }
      echo.set(echoNext);

      fill(turn);
    },
  };

  function fill(turn: number) {
    const lift = m.lift;
    for (let i = 0; i < N; i++) {
      const s = along(i);
      let o = i * 4;
      body[o] = airway.roofX[i];
      body[o + 1] = airway.roofY[i];
      body[o + 2] = airway.acrossX[i];
      body[o + 3] = airway.acrossY[i];
      o += N * 4;
      body[o] = airway.gap[i];
      body[o + 1] = airway.half[i];
      body[o + 2] = airway.arch[i];
      body[o + 3] = clamp(now[T.pressure + i], 0, 1);
      o += N * 4;
      // The floor of the mouth goes with the jaw; the root of the tongue goes half with the jaw
      // and half with the larynx below it.
      const ts = clamp(s, TONGUE_FROM, TONGUE_TO);
      const fx = floorRestX(ts);
      const fy = floorRestY(ts);
      const share = mix(0.45, 1, smoothstep(0.2, 0.6, ts));
      body[o] = clamp(now[T.noise + i], 0, 1);
      body[o + 1] = mix(fx, swingX(fx, fy, turn), share);
      body[o + 2] = mix(fy, swingY(fx, fy, turn), share) + lift * liftShare(ts) * 0.6;
      body[o + 3] = tongueHalf(ts);
      o += N * 4;
      // The nose has half as many points as the row has texels: read it with blending.
      const t = i / (N - 1);
      const at = t * (NOSE_POINTS - 1);
      const k = Math.min(NOSE_POINTS - 2, Math.floor(at));
      const area = mix(now[T.noseArea + k], now[T.noseArea + k + 1], at - k);
      const tall = noseTall(t);
      body[o] = noseX(t);
      body[o + 1] = noseY(t);
      body[o + 2] = tall;
      // Two passages share the area; each is a tall slot, as wide as the area leaves it.
      body[o + 3] = clamp(Math.max(0, area) / (2 * tall), 0, noseReach(t) * 0.92);
      o += N * 4;
      const v = t * (VELUM_POINTS - 1);
      const j = Math.min(VELUM_POINTS - 2, Math.floor(v));
      const b = v - j;
      body[o] = clamp(mix(now[T.nosePressure + k], now[T.nosePressure + k + 1], at - k), 0, 1);
      body[o + 1] = echo[i];
      body[o + 2] = mix(velum.x[j], velum.x[j + 1], b);
      body[o + 3] = mix(velum.y[j], velum.y[j + 1], b);
      o += N * 4;
      body[o] = mix(velum.upX[j], velum.upX[j + 1], b);
      body[o + 1] = mix(velum.upY[j], velum.upY[j + 1], b);
      body[o + 2] = velumThick(t);
      body[o + 3] = velumHalf(t);
      o += N * 4;
      const e = 0.01;
      const dx = noseX(t + e) - noseX(t - e);
      const dy = noseY(t + e) - noseY(t - e);
      const l = Math.hypot(dx, dy) || 1;
      body[o] = -dy / l;
      body[o + 1] = dx / l;
      body[o + 2] = 0;
      body[o + 3] = 0;
    }
  }

  m.step(0);
  return m;
}

const wrap = (v: number) => v - Math.floor(v);

/** Where the tongue's surface is in the middle of the head at s, for finding it under the pointer. */
export function tongueTop(m: Moving, s: number, out: Float32Array, at: number): void {
  const f = clamp(s, 0, 1) * (N - 1);
  const i = Math.min(N - 2, Math.floor(f));
  const b = f - i;
  const a = m.airway;
  const gap = mix(a.gap[i], a.gap[i + 1], b);
  out[at] = mix(a.roofX[i], a.roofX[i + 1], b) + mix(a.acrossX[i], a.acrossX[i + 1], b) * gap;
  out[at + 1] = mix(a.roofY[i], a.roofY[i + 1], b) + mix(a.acrossY[i], a.acrossY[i + 1], b) * gap;
  out[at + 2] = 0;
}
