// Framing: draw what matters (the head, a part alone, the parts taken apart) as large as the room
// the page leaves between its controls allows, and in the middle of that room.
import { land, see, type Eye } from "./camera.ts";
import { placePoint, type Placement } from "./cast.ts";

/** Space left round what is fitted, as a share of the free rectangle's shorter side. */
export const MARGIN = 0.05;

/**
 * One step of framing. It measures where `count` points of `cloud` ([x, y, z, …] in cm) land with
 * the eye as `see` last placed it, works out the size (`fit`, which the eye's zoom is multiplied
 * by) and the slide (`eye.shiftX`, `eye.shiftY`) that would put them inside the room, centred,
 * and moves a share `k` (0..1) of the way there. The perspective makes that guess a little off;
 * the next step's measurement corrects it, so a few steps settle it exactly.
 *
 * `room` is left, top, right, bottom in CSS pixels; `scale` is picture pixels per CSS pixel. The
 * eye must be placed with its zoom at `fit` alone: the user's own zoom rides on top of the fit
 * and must not change it (a closer eye sees the near side of the head larger). Returns the new fit.
 */
export function frameStep(eye: Eye, cloud: Float32Array, count: number, room: ArrayLike<number>, scale: number, fit: number, k: number, spot: Float32Array): number {
  const W = eye.width;
  const H = eye.height;
  const left = room[0] * scale;
  const top = room[1] * scale;
  const right = room[2] * scale;
  const bottom = room[3] * scale;
  // The room, never less than a third of the picture each way, however much the page asks for.
  const fw = Math.max(W - left - right, W / 3);
  const fh = Math.max(H - top - bottom, H / 3);
  const cx = Math.min(Math.max(left + (W - left - right) / 2, fw / 2), W - fw / 2);
  const cy = Math.min(Math.max(top + (H - top - bottom) / 2, fh / 2), H - fh / 2);
  const margin = MARGIN * Math.min(fw, fh);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    land(eye, cloud[i * 3], cloud[i * 3 + 1], cloud[i * 3 + 2], spot);
    if (spot[2] <= 0) continue;
    x0 = Math.min(x0, spot[0]);
    x1 = Math.max(x1, spot[0]);
    y0 = Math.min(y0, spot[1]);
    y1 = Math.max(y1, spot[1]);
  }
  if (!(x1 > x0 && y1 > y0)) return fit;
  const grow = Math.min((fw - 2 * margin) / (x1 - x0), (fh - 2 * margin) / (y1 - y0));
  const goal = Math.min(8, Math.max(0.1, fit * grow));
  const scaled = goal / fit;
  // Where its middle lands, from the point the eye looks at, before the slide.
  const offX = (x0 + x1) / 2 - eye.shiftX * W * 0.5 - W / 2;
  const offY = (y0 + y1) / 2 + eye.shiftY * H * 0.5 - H / 2;
  const slideX = ((cx - W / 2 - offX * scaled) * 2) / W;
  const slideY = (-(cy - H / 2 - offY * scaled) * 2) / H;
  eye.shiftX += (slideX - eye.shiftX) * k;
  eye.shiftY += (slideY - eye.shiftY) * k;
  return fit + (goal - fit) * k;
}

// ── a directed shot (director.ts), framed exactly each frame ──

/** Points of a head that must stay in the frame: the crown, the face, the back of the skull, and below the chin where its name is written. */
export const KEEP = [[-0.5, 19, 0], [13, 3, 0], [-11, 5, 0], [1.5, -22, 0]] as const;
/** Going in on the throat: the brow to below the folds, the lips to the back of the airway. */
export const DETAIL = [[3, 9, 0], [11, -1, 0], [1.5, -14, 0], [-4, -5, 0]] as const;
/** The point under the chin where a singer's name goes. */
export const UNDER_CHIN = [1.5, -12.5, 0] as const;
/** Where a directed shot looks on a head: the middle of it from the crown to its name, or the throat when it goes in. */
const FACE = [2, -1, 0] as const;
const THROAT = [3.5, -4, 0] as const;
/** A singer standing this far back (cm) is in a row behind another. */
export const BACK_ROW = 12;
/** How far down (radians) a directed shot on some of a choir in rows looks, to part the rows. */
const ROWS_APART = 0.24;
/** How much of its turn a directed shot on some of a choir keeps when the choir stands in rows. */
const ROWS_TURN = 0.45;
/** How much of a look from below a choir in rows is given. */
const ROWS_BELOW = 0.45;

/** Does the choir stand in more than one row? */
export const inRows = (heads: readonly (Placement | null)[]): boolean => heads.some((p) => !!p && p.z < -BACK_ROW);

/**
 * The eye's turn and lean that a directed shot adds. A shot on some of a choir standing in rows
 * turns less far (seen much from the side, one row stands in front of the other), and looks a
 * little down on them, which parts the rows: the one behind rises in the picture, the one in
 * front sinks.
 */
export function shotTurn(ask: { yaw: number; pitch: number; toward: number }, rows: boolean): { yaw: number; pitch: number } {
  // (the whole choir may be turned: every head is in the shot, and an arc round it shows the rows
  // as rows; but seen from below the row in front rises over the faces behind, so less of that)
  if (!rows) return { yaw: ask.yaw, pitch: ask.pitch };
  return { yaw: ask.yaw * (1 - (1 - ROWS_TURN) * ask.toward), pitch: (ask.pitch < 0 ? ask.pitch * ROWS_BELOW : ask.pitch) + ROWS_APART * ask.toward };
}

/** The point of a head a directed shot looks at, `detail` of the way from its face to its throat. */
export function lookPoint(place: Placement, detail: number, out: Float32Array): void {
  placePoint(place, FACE[0] + (THROAT[0] - FACE[0]) * detail, FACE[1] + (THROAT[1] - FACE[1]) * detail, 0, out);
}

/** The room in picture pixels, `names` pixels taller at the bottom: left, top, width, height, middle, margin. */
export function shotRoom(eye: Eye, room: ArrayLike<number>, scale: number, names: number) {
  const W = eye.width, H = eye.height;
  const left = room[0] * scale, top = room[1] * scale;
  const fw = Math.max(W / 3, W - left - room[2] * scale), fh = Math.max(H / 3, H - top - Math.max(0, room[3] * scale - names));
  return { left, top, fw, fh, cx: left + fw / 2, cy: top + fh / 2, margin: MARGIN * Math.min(fw, fh), names };
}
export type ShotRoom = ReturnType<typeof shotRoom>;

const point = new Float32Array(3);
const landed = new Float32Array(3);

/**
 * How many times closer than now the eye could go and still hold these points of a head inside
 * the room, scaling about the room's middle (where a directed shot puts what it looks at). With
 * the names' height known, the name is held in by it, under the chin.
 */
export function closerBy(eye: Eye, place: Placement, points: readonly (readonly number[])[], box: ShotRoom): number {
  let most = Infinity;
  for (const p of points) {
    const name = box.names > 0 && p === KEEP[3];
    if (name) placePoint(place, UNDER_CHIN[0], UNDER_CHIN[1], UNDER_CHIN[2], point);
    else placePoint(place, p[0], p[1], p[2], point);
    land(eye, point[0], point[1], point[2], landed);
    if (landed[2] <= 0) return 0.05;
    const dx = landed[0] - box.cx, dy = landed[1] + (name ? box.names : 0) - box.cy;
    if (Math.abs(dx) > 0.5) most = Math.min(most, (box.fw / 2 - box.margin) / Math.abs(dx));
    if (Math.abs(dy) > 0.5) most = Math.min(most, (box.fh / 2 - box.margin) / Math.abs(dy));
  }
  return most;
}

/** What a directed shot asks of the frame (director.ts's Take). */
export interface ShotAsk {
  tight: number;
  toward: number;
  detail: number;
  focus: ArrayLike<number>;
}

/** The camera's own zoom and slide, on top of the framing's fit and slide; kept from frame to frame. */
export interface ShotState {
  zoom: number;
  shiftX: number;
  shiftY: number;
}

/**
 * Frame a directed shot: the zoom that holds its heads as large as `tight` asks without cutting
 * any of them or their names, and the slide that puts what it looks at (`look`, a point of the
 * stage, or null for the choir) `toward` of the way to the room's middle. Every head counts as much
 * as it is in the shot (all of them in a wide one), so a head the shot is turning to is never cut
 * on the way in. `base` is the fit (and the user's zoom) and the framing's slide, that the shot
 * rides on; `heads` the places of the heads on the stage (null: not there). Leaves the eye placed.
 */
export function frameShot(eye: Eye, base: ShotState, heads: readonly (Placement | null)[], ask: ShotAsk, look: ArrayLike<number> | null, room: ArrayLike<number>, scale: number, names: number, state: ShotState, rounds: number): void {
  let most = 0;
  for (let i = 0; i < heads.length; i++) most = Math.max(most, ask.focus[i] ?? 0);
  const place = () => {
    eye.zoom = base.zoom * state.zoom;
    eye.shiftX = base.shiftX + state.shiftX;
    eye.shiftY = base.shiftY + state.shiftY;
    see(eye, eye.width, eye.height);
  };
  for (let round = 0; round < rounds; round++) {
    place();
    const box = shotRoom(eye, room, scale, names);
    const W = eye.width, H = eye.height;
    if (look) {
      land(eye, look[0], look[1], look[2], landed);
      if (landed[2] > 0) {
        const x0 = landed[0] - (state.shiftX * W) / 2;
        const y0 = landed[1] + (state.shiftY * H) / 2;
        state.shiftX = (ask.toward * (box.cx - x0) * 2) / W;
        state.shiftY = (-ask.toward * (box.cy - y0) * 2) / H;
      }
    } else state.shiftX = state.shiftY = 0;
    place();
    let cap = 8;
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i];
      if (!head) continue;
      const share = 1 - ask.toward + ask.toward * (most > 0 ? (ask.focus[i] ?? 0) / most : 1);
      if (share < 0.02) continue;
      let closer = closerBy(eye, head, KEEP, box);
      if (ask.detail > 0.001 && (ask.focus[i] ?? 0) > 0) closer = Math.exp(Math.log(closer) + (Math.log(closerBy(eye, head, DETAIL, box)) - Math.log(closer)) * ask.detail);
      const weight = Math.min(1, share / 0.4);
      cap = Math.min(cap, (state.zoom * closer) / (weight * weight * (3 - 2 * weight)));
    }
    const want = ask.tight >= 0 ? Math.pow(Math.max(1, cap), ask.tight) : 1 + ask.tight;
    state.zoom = Math.max(0.5, Math.min(8, softMin(want, cap)));
    if (!Number.isFinite(state.zoom)) state.zoom = 1;
    if (!Number.isFinite(state.shiftX) || !Number.isFinite(state.shiftY)) state.shiftX = state.shiftY = 0;
  }
  place();
}

/**
 * The smaller of a and b, softened as a nears b: a push-in slows into the closest the frame
 * allows instead of stopping dead at it.
 */
export function softMin(a: number, b: number): number {
  const knee = 0.85;
  const x = a / b;
  return x <= knee ? a : b * (knee + (1 - knee) * Math.tanh((x - knee) / (1 - knee)));
}
