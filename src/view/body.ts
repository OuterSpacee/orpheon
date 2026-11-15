// The parts of the head that move without being part of the tube: the jaw's swing, the soft
// palate's flap, and the line the nose's passages follow. Same coordinates as tract.ts (cm; x
// forward, y up, y = 0 where the teeth meet, z sideways).
import { clamp, curve, mix } from "./curve.ts";

// ── the jaw ──

/**
 * The point the jaw turns about. The real joint is higher, in front of the ear, but it slides
 * forward as the jaw opens; turning about a point halfway down the jaw's upright gives the same
 * path for the chin without the slide.
 */
export const JAW_PIVOT = [-0.9, 1.6] as const;
/** The jaw's turn in radians for a pose's jaw value: fully open parts the front teeth about 2.5 cm. */
export const jawTurn = (jaw: number) => 0.29 * clamp(jaw, 0, 1);

/** Where a point of the jaw is after the jaw has turned. */
export function swingX(x: number, y: number, turn: number): number {
  return JAW_PIVOT[0] + (x - JAW_PIVOT[0]) * Math.cos(turn) + (y - JAW_PIVOT[1]) * Math.sin(turn);
}
export function swingY(x: number, y: number, turn: number): number {
  return JAW_PIVOT[1] - (x - JAW_PIVOT[0]) * Math.sin(turn) + (y - JAW_PIVOT[1]) * Math.cos(turn);
}

/** Half the width of the closed mouth, corner to middle. */
export const MOUTH_HALF = 2.3;
/** The middle of the line where the closed lips meet. */
export const LIP_LINE = [9.0, 0.02] as const;

// ── the soft palate ──

// Its underside (the side the tongue sees) from the back edge of the hard palate to the tip of
// the uvula, raised against the back wall of the throat and hanging open.
const RAISED = [3.5, 1.8, 2.55, 1.6, 1.4, 1.15, 0.55, 0.45];
const LOWERED = [3.5, 1.8, 2.7, 1.3, 1.95, 0.55, 1.45, -0.35];

/** How many points describe the soft palate from its hinge (0) to its tip. */
export const VELUM_POINTS = 16;

export interface Velum {
  x: Float32Array;
  y: Float32Array;
  /** Unit direction from the underside to the top (the nose's side). */
  upX: Float32Array;
  upY: Float32Array;
}
export const makeVelum = (): Velum => ({
  x: new Float32Array(VELUM_POINTS),
  y: new Float32Array(VELUM_POINTS),
  upX: new Float32Array(VELUM_POINTS),
  upY: new Float32Array(VELUM_POINTS),
});

/** A smooth line through four points at t = 0, 1/3, 2/3, 1. */
function through(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = (-9 * p0 + 27 * p1 - 27 * p2 + 9 * p3) / 2;
  const b = (18 * p0 - 45 * p1 + 36 * p2 - 9 * p3) / 2;
  const c = (-11 * p0 + 18 * p1 - 9 * p2 + 2 * p3) / 2;
  return ((a * t + b) * t + c) * t + p0;
}

/** The soft palate for a pose's velum value (0 raised, shutting the nose; 1 lowered). Does not allocate. */
export function shapeVelum(out: Velum, velum: number): void {
  const v = clamp(velum, 0, 1);
  const p = (k: number) => mix(RAISED[k], LOWERED[k], v);
  for (let i = 0; i < VELUM_POINTS; i++) {
    const t = i / (VELUM_POINTS - 1);
    out.x[i] = through(p(0), p(2), p(4), p(6), t);
    out.y[i] = through(p(1), p(3), p(5), p(7), t);
  }
  for (let i = 0; i < VELUM_POINTS; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(VELUM_POINTS - 1, i + 1);
    const dx = out.x[b] - out.x[a];
    const dy = out.y[b] - out.y[a];
    const l = Math.hypot(dx, dy) || 1;
    // The flap runs backward from its hinge, so "up" is the direction of travel turned right.
    out.upX[i] = dy / l;
    out.upY[i] = -dx / l;
  }
}
/** How thick the soft palate is at t (0 hinge to 1 tip): fullest in the middle, rounded off at the uvula. */
export function velumThick(t: number): number {
  const body = 0.5 + 0.28 * Math.sin(Math.PI * Math.min(1, t / 0.8));
  return t > 0.82 ? body * Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) * 0.8 + 0.1 : body;
}
/** Half its width at t: as wide as the palate at the hinge, a finger's width at the uvula. */
export const velumHalf = (t: number) => mix(1.9, 0.4, Math.pow(clamp(t, 0, 1), 1.4));

// ── the nose ──

// The line through the nose's passages, from the port behind the soft palate (t = 0), up into the
// space behind the nose, forward above the palate and down to the nostrils (t = 1).
export const noseX = curve([0, 0.75, 0.1, 0.7, 0.22, 1.5, 0.35, 2.9, 0.55, 5.2, 0.75, 7.5, 0.88, 9.0, 1, 9.9]);
export const noseY = curve([0, 0.9, 0.1, 2.1, 0.22, 3.3, 0.35, 3.9, 0.55, 4.05, 0.75, 3.7, 0.88, 3.15, 1, 2.4]);
/** How tall the passage is at t, measured across the line. */
export const noseTall = curve([0, 0.8, 0.1, 1.2, 0.22, 2.0, 0.35, 2.9, 0.55, 3.2, 0.75, 2.5, 0.88, 1.3, 1, 0.75]);
/** How far each side's passage can reach sideways from the wall between them at t. */
export const noseReach = curve([0, 0.9, 0.1, 1.1, 0.22, 1.25, 0.4, 1.35, 0.6, 1.3, 0.78, 1.0, 0.9, 0.7, 1, 0.5]);
/** Half the thickness of the wall between the two passages. */
export const SEPTUM = 0.13;
/** The middle of each nostril, where the nose's sound leaves. */
export const NOSTRIL = [9.9, 2.4, 0.55] as const;
