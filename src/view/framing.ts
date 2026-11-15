// Framing: draw what matters (the head, a part alone, the parts taken apart) as large as the room
// the page leaves between its controls allows, and in the middle of that room.
import { land, type Eye } from "./camera.ts";

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
