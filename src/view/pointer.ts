// The pointer: dragging empty space turns the head (it keeps a little of its spin when let go),
// the wheel or a pinch zooms, resting on a part names it, and dragging the jaw, tongue, lips,
// soft palate or larynx asks the voice to move that part.
import { POSE, TELEMETRY as T, type Pose } from "../contract.ts";
import { swingX, swingY } from "./body.ts";
import { land, type Eye } from "./camera.ts";
import { clamp } from "./curve.ts";
import type { Part } from "./dust.ts";
import { tongueTop, type Moving } from "./moving.ts";
import { N } from "./tract.ts";

interface Needs {
  eye: Eye;
  /** The body of the singer the pointer is over. */
  moving(): Moving;
  /** Move a point of that singer's head (its own coordinates, at[0..2]) to where it stands on the stage. */
  place(at: Float32Array): void;
  /** Choose the singer nearest this place in the picture (pixels); returns its index. */
  focus(x: number, y: number): number;
  /** Can the body be dragged? (Not while a choir stands: whose voice would it move?) */
  grabbable(): boolean;
  /** The parts made so far; a part still being made is null. */
  parts: (Part | null)[];
  /** Is layer i fully there (shown, and not a ghost)? */
  shows(i: number): boolean;
  /** Where the explode has carried layer i. */
  apartOf(i: number, out: Float32Array): void;
  cut(): number;
  calm(): boolean;
  hover(layer: number): void;
  grab(pose: Partial<Pose>): void;
  wake(): void;
}

type Handle = "jaw" | "tongue" | "lips" | "velum" | "larynx";
// Layers by their place in LAYERS.
const SKIN = 0, BONE = 1, TONGUE = 2, LIPS = 3, PALATE = 4, AIR = 6, LARYNX = 7, SOUND = 9;
/** When several parts are under the pointer, the inner, smaller one is meant: this is the order they are asked in. */
const INNER_FIRST = [2, 3, 4, 7, 5, 6, 8, 9, 1, 0];

export function makePointer(canvas: HTMLCanvasElement, needs: Needs) {
  const { eye } = needs;
  const goal = { yaw: 0, pitch: 0, zoom: 1 };
  const spin = { yaw: 0, pitch: 0 };
  const down = new Map<number, { x: number; y: number }>();
  const spot = new Float32Array(3);
  const shift = new Float32Array(3);
  const at = new Float32Array(3);
  const staged = new Float32Array(3);
  let pace = 0.14;
  let px = -1;
  let py = -1;
  let moved = false;
  let over = -1;
  let overSinger = 0;
  let overHandle: Handle | null = null;
  let held: Handle | null = null;
  let heldFrom = { x: 0, y: 0, a: 0, b: 0 };
  /** Which lip was taken: +1 the upper (dragged up, the mouth opens), -1 the lower (dragged down). */
  let lip = -1;
  let overLip = -1;
  let pinch = 0;
  let lastMove = 0;
  canvas.style.touchAction = "none";

  const scale = () => canvas.width / Math.max(1, canvas.clientWidth);
  const place = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * scale(), y: (e.clientY - r.top) * scale() };
  };

  /** How near (in picture pixels) the pointer is to a point of the scene; Infinity if the cut has taken it away. */
  function near(layer: number, x: number, y: number, z: number): number {
    if (needs.cut() > 0.6 && z > 0.3) return Infinity;
    needs.apartOf(layer, shift);
    staged[0] = x + shift[0];
    staged[1] = y + shift[1];
    staged[2] = z + shift[2];
    needs.place(staged);
    land(eye, staged[0], staged[1], staged[2], spot);
    return spot[2] > 0 ? Math.hypot(spot[0] - px, spot[1] - py) : Infinity;
  }

  /** The nearest of a part's movable handles. */
  function handleNear(): { handle: Handle | null; layer: number } {
    if (!needs.grabbable()) return { handle: null, layer: -1 };
    const moving = needs.moving();
    const reach = 26 * scale();
    let best = reach;
    let handle: Handle | null = null;
    let layer = -1;
    const offer = (h: Handle, l: number, x: number, y: number, z: number, side = 0) => {
      const d = near(l, x, y, z);
      if (d < best) {
        best = d;
        handle = h;
        layer = l;
        overLip = side;
      }
    };
    const turn = Math.atan2(moving.jawSin, moving.jawCos);
    if (needs.shows(TONGUE)) {
      for (let s = 0.3; s < 0.92; s += 0.08) {
        tongueTop(moving, s, at, 0);
        offer("tongue", TONGUE, at[0], at[1], 0);
        const o = (2 * N + Math.round(s * (N - 1))) * 4;
        offer("tongue", TONGUE, (at[0] + moving.body[o + 1]) / 2, (at[1] + moving.body[o + 2]) / 2, 0);
      }
    }
    if (needs.shows(LIPS)) {
      offer("lips", LIPS, moving.mouthX + 0.1, moving.mouthY + 0.9, 0, 1);
      offer("lips", LIPS, moving.mouthX, moving.mouthY - 0.9, 0, -1);
    }
    if (needs.shows(PALATE)) {
      for (let i = 20; i < N; i += 6) {
        const o = (4 * N + i) * 4;
        offer("velum", PALATE, moving.body[o + 2], moving.body[o + 3] + 0.3, 0);
      }
    }
    if (needs.shows(LARYNX)) {
      offer("larynx", LARYNX, 2.5, -8.2 + moving.lift, 0);
      offer("larynx", LARYNX, 1.6, -9.6 + moving.lift, 0);
    }
    const jaw = needs.shows(BONE) ? BONE : needs.shows(SKIN) ? SKIN : -1;
    if (jaw >= 0) {
      for (const [x, y, z] of [[8.2, -3.6, 0], [6.5, -4.2, 1.8], [3.5, -3.6, 3.6], [7.9, -1.6, 0]]) {
        offer("jaw", jaw, swingX(x, y, turn), swingY(x, y, turn), z);
        offer("jaw", jaw, swingX(x, y, turn), swingY(x, y, turn), -z);
      }
    }
    return { handle, layer };
  }

  /** Which part is under the pointer. */
  function find(): void {
    const singer = px >= 0 ? needs.focus(px, py) : overSinger;
    const moving = needs.moving();
    const h = handleNear();
    let layer = h.layer;
    if (layer < 0 && px >= 0) {
      const reach = 15 * scale();
      for (const i of INNER_FIRST) {
        if (!needs.shows(i)) continue;
        // The skin is everywhere, so it only answers when nothing inside does, and from further off.
        const within = i === SKIN || i === BONE ? reach * 1.8 : reach;
        let hit = false;
        if (i === AIR) {
          // The air has no place of its own: it is wherever the tube is this frame.
          const a = moving.airway;
          for (let k = 0; k < N && !hit; k += 2) hit = near(i, a.roofX[k] + a.acrossX[k] * a.gap[k] * 0.5, a.roofY[k] + a.acrossY[k] * a.gap[k] * 0.5, 0) < within;
        } else if (i === SOUND) {
          // The sound is the air in front of the mouth, while there is any.
          for (let r = 1.5; r < 14 && !hit && moving.now[T.level] > 0.02; r += 1.5) {
            hit = near(i, moving.mouthX + r, moving.mouthY, 0) < within * (1 + r * 0.15);
          }
        } else {
          const marks = needs.parts[i]?.marks;
          if (!marks) continue;
          for (let k = 0; k < marks.length && !hit; k += 3) hit = near(i, marks[k], marks[k + 1], marks[k + 2]) < within;
        }
        if (hit) {
          layer = i;
          break;
        }
      }
    }
    overHandle = h.handle;
    canvas.style.cursor = held ? "grabbing" : h.handle ? "grab" : "";
    if (layer !== over || singer !== overSinger) {
      over = layer;
      overSinger = singer;
      needs.hover(layer);
    }
  }

  function startGrab(handle: Handle, p: { x: number; y: number }): void {
    const pose = needs.moving().now;
    const k = T.pose;
    held = handle;
    lip = overLip;
    heldFrom = {
      x: p.x, y: p.y,
      a: handle === "jaw" ? pose[k + POSE.jaw] : handle === "tongue" ? pose[k + POSE.tongueX] : handle === "lips" ? pose[k + POSE.lips] : handle === "velum" ? pose[k + POSE.velum] : pose[k + POSE.larynx],
      b: handle === "tongue" ? pose[k + POSE.tongueY] : handle === "lips" ? pose[k + POSE.round] : 0,
    };
  }

  function drag(p: { x: number; y: number }): void {
    // The drag in cm, in the head's own forward and up.
    const perCm = eye.pixels / eye.far;
    const forward = ((p.x - heldFrom.x) / perCm) * (Math.cos(eye.yaw) < 0 ? -1 : 1);
    const up = -(p.y - heldFrom.y) / perCm;
    const unit = (v: number) => clamp(v, 0, 1);
    if (held === "jaw") needs.grab({ jaw: unit(heldFrom.a - up / 2.6) });
    else if (held === "tongue") needs.grab({ tongueX: unit(heldFrom.a + forward / 3), tongueY: unit(heldFrom.b + up / 2.2) });
    else if (held === "lips") needs.grab({ lips: unit(heldFrom.a + (lip * up) / 1.4), round: unit(heldFrom.b + forward / 1.2) });
    else if (held === "velum") needs.grab({ velum: unit(heldFrom.a - up / 1.2) });
    else if (held === "larynx") needs.grab({ larynx: clamp(heldFrom.a + up / 0.7, -1, 1) });
  }

  const onDown = (e: PointerEvent) => {
    const p = place(e);
    canvas.setPointerCapture(e.pointerId);
    down.set(e.pointerId, p);
    px = p.x;
    py = p.y;
    if (down.size === 1) {
      find();
      if (overHandle) startGrab(overHandle, p);
      spin.yaw = spin.pitch = 0;
      pace = 0.14;
      lastMove = performance.now();
    } else {
      held = null;
      const [a, b] = [...down.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    needs.wake();
  };
  const onMove = (e: PointerEvent) => {
    const p = place(e);
    const was = down.get(e.pointerId);
    px = p.x;
    py = p.y;
    moved = true;
    needs.wake();
    if (!was) return;
    down.set(e.pointerId, p);
    if (down.size >= 2) {
      const [a, b] = [...down.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) goal.zoom = clamp((goal.zoom * span) / pinch, 0.35, 8);
      pinch = span;
    } else if (held) drag(p);
    else {
      const turn = 0.0055 / scale();
      const dyaw = -(p.x - was.x) * turn;
      const dpitch = (p.y - was.y) * turn;
      goal.yaw += dyaw;
      goal.pitch = clamp(goal.pitch + dpitch, -1.35, 1.35);
      const now = performance.now();
      const dt = Math.max(0.004, (now - lastMove) / 1000);
      lastMove = now;
      spin.yaw = spin.yaw * 0.5 + (dyaw / dt) * 0.5;
      spin.pitch = spin.pitch * 0.5 + (dpitch / dt) * 0.5;
    }
  };
  const onUp = (e: PointerEvent) => {
    down.delete(e.pointerId);
    pinch = 0;
    if (down.size === 0) {
      held = null;
      // Let go after a pause and the head stays put; let go mid-swing and it carries on a little.
      if (performance.now() - lastMove > 90 || needs.calm()) spin.yaw = spin.pitch = 0;
    }
  };
  const onLeave = () => {
    px = py = -1;
    moved = true;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.zoom = clamp(goal.zoom * Math.exp(-e.deltaY * 0.0014), 0.35, 8);
    pace = 0.14;
    needs.wake();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const pointer = {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    /** Point the eye, easing there. */
    look(yaw: number, pitch: number, zoom: number) {
      goal.yaw = yaw;
      goal.pitch = clamp(pitch, -1.35, 1.35);
      goal.zoom = clamp(zoom, 0.35, 8);
      spin.yaw = spin.pitch = 0;
      pace = 0.4;
    },
    /** One frame of easing and coasting; also finds what the pointer is over, if it has moved. */
    settle(dt: number, instant: boolean) {
      if (down.size === 0 && (spin.yaw !== 0 || spin.pitch !== 0)) {
        goal.yaw += spin.yaw * dt;
        goal.pitch = clamp(goal.pitch + spin.pitch * dt, -1.35, 1.35);
        const fade = Math.exp(-dt / 0.3);
        spin.yaw *= fade;
        spin.pitch *= fade;
        if (Math.abs(spin.yaw) + Math.abs(spin.pitch) < 0.01) spin.yaw = spin.pitch = 0;
      }
      const k = instant ? 1 : 1 - Math.exp(-dt / pace);
      pointer.yaw += (goal.yaw - pointer.yaw) * k;
      pointer.pitch += (goal.pitch - pointer.pitch) * k;
      pointer.zoom *= Math.pow(goal.zoom / pointer.zoom, k);
      if (moved && !held && down.size === 0) {
        moved = false;
        if (px < 0) {
          if (over !== -1) needs.hover((over = -1));
          canvas.style.cursor = "";
        } else find();
      }
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
  return pointer;
}
