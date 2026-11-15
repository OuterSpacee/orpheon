// A choir on one stage: where each singer's head stands, how it is turned and how big it is, and
// how a head eases in, out, and from dim (silent) to bright (singing).
//
// The heads stand in rows on risers, the smaller bodies in front, every row a gentle arc whose
// singers turn a little more toward the eye the further right they stand. They face the
// way the solo head faces (to the right) but turned part of the way toward the eye, so the
// airway is still seen nearly side on and the faces are seen too. One singer stands alone where
// the solo head always has. Same coordinates as the rest of the view: cm, x forward, y up.
import { POSE, TELEMETRY as T } from "../contract.ts";
import type { Body } from "../contract.ts";
import type { Moving } from "./moving.ts";

/** The most singers on the stage: the voices the page can seat. */
export const CAST_MAX = 6;

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Radians the head is turned about its upright, its face toward the eye: 0 is the profile. */
  turn: number;
  /** Its size: 1 is the solo head. */
  scale: number;
}

/** Between two heads of a row, in cm, before the parts are pulled apart. */
const SPACING = 31;
/** How much higher, and how much further back, each row stands than the one in front of it. */
const RISE = 17;
const BACK = 26;
/** How far the middle of a row stands behind its ends. */
const ARC = 7;
/** How far the choir is turned toward the eye from the profile, and how much more (or less) the ends of a row are, as on an arc. */
const FACING = 0.75;
const FAN = 0.12;
/** A head's size on screen for choosing rows, in cm: its width seen three-quarters on, and its height from the crown to where the bust fades. */
const HEAD_WIDE = 26;
const HEAD_TALL = 31;

/** How big a body's head is drawn: a child's smaller than a bass's, though not in proportion to the airway (a child's head is nearly grown). */
export const headScale = (body: Body): number => Math.pow(body.tract / 16.8, 0.8);

/**
 * Where each singer stands, for bodies in the cast's order, a room whose width is `aspect` times
 * its height, and the parts pulled `apart` (0..1, the explode) so far.
 */
export function arrange(bodies: readonly Body[], aspect: number, apart = 0): Placement[] {
  const n = bodies.length;
  if (n <= 1) return n ? [{ x: 0, y: 0, z: 0, turn: 0, scale: 1 }] : [];
  const scales = bodies.map(headScale);
  const spacing = SPACING + 52 * apart;
  const rise = RISE + 14 * apart;

  // As many rows as make the heads largest in the room; a row more must earn its place. Two
  // rows of one would stand one singer straight behind the other: never.
  const countsFor = (r: number) => Array.from({ length: r }, (_, k) => Math.floor(n / r) + (k < n % r ? 1 : 0));
  let rows = 1;
  let best = 0;
  for (let r = 1; r <= Math.min(3, n); r++) {
    if (countsFor(r).some((c, k, all) => c === 1 && all[k + 1] === 1)) continue;
    const across = Math.ceil(n / r);
    const wide = (across - 1) * spacing + HEAD_WIDE + (r > 1 && n % r === 0 ? spacing / 2 : 0);
    const tall = (r - 1) * rise + HEAD_TALL;
    const size = Math.min(aspect / wide, 1 / tall) * (r > 1 ? 0.85 ** (r - 1) : 1);
    if (size > best) {
      best = size;
      rows = r;
    }
  }

  // The smaller bodies in front; within a row, the cast's own order from left to right.
  const bySize = bodies.map((_, i) => i).sort((a, b) => scales[a] - scales[b] || a - b);
  const counts = countsFor(rows);
  const out: Placement[] = new Array(n);
  let taken = 0;
  for (let r = 0; r < rows; r++) {
    const row = bySize.slice(taken, taken + counts[r]).sort((a, b) => a - b);
    taken += counts[r];
    // A row as long as the one in front stands in its gaps, half a place along.
    const along = r > 0 && counts[r] === counts[r - 1] ? (r % 2 ? 0.5 : 0) : 0;
    row.forEach((who, k) => {
      const x = (k - (row.length - 1) / 2 + along) * spacing;
      const half = Math.max(1, ((Math.max(...counts) - 1) / 2) * spacing);
      const u = Math.max(-1, Math.min(1, x / half));
      const s = scales[who];
      out[who] = { x, y: r * rise - (1 - s) * 20, z: -r * BACK - ARC * (1 - u * u), turn: FACING + FAN * u, scale: s };
    });
  }

  // Centred.
  let x0 = Infinity, x1 = -Infinity;
  for (const p of out) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
  }
  const mid = (x0 + x1) / 2;
  for (const p of out) {
    p.x -= mid;
  }
  return out;
}

/** Where a point of a head (its own coordinates, cm) stands on the stage. */
export function placePoint(p: Placement, x: number, y: number, z: number, out: Float32Array, at = 0): void {
  const c = Math.cos(p.turn);
  const s = Math.sin(p.turn);
  const k = p.scale;
  out[at] = p.x + (x * c - z * s) * k;
  out[at + 1] = p.y + y * k;
  out[at + 2] = p.z + (x * s + z * c) * k;
}

/** How long a singer stays lit after its last sound, in seconds: a breath between phrases is not an exit. */
const LINGER = 1.4;
/** How dim a silent singer rests. */
export const RESTING = 0.3;

/** One place on the stage and what stands there now, easing toward what was asked. */
export interface Seat {
  /** Is this place in the cast? */
  wanted: boolean;
  body: Body;
  name: string;
  /** 0 gone .. 1 fully there. */
  here: number;
  /** Where it stands now, and where it is going. */
  now: Placement;
  goal: Placement;
  /** 0 silent .. 1 singing, eased. */
  lit: number;
  /** Seconds since it last made a sound. */
  quiet: number;
}

export function makeSeat(): Seat {
  return {
    wanted: false, body: { tract: 16.8, folds: 0.7 }, name: "", here: 0,
    now: { x: 0, y: 0, z: 0, turn: 0, scale: 1 }, goal: { x: 0, y: 0, z: 0, turn: 0, scale: 1 },
    lit: 0, quiet: 99,
  };
}

/** Is the voice making any sound at all: a note, a breath through a narrow gap, a burst? */
export function sounding(m: Moving): boolean {
  const now = m.now;
  return now[T.level] > 0.015 || now[T.voiced] > 0.15 || m.hiss > 0.08 || (now[T.pose + POSE.lungs] > 0.2 && Math.abs(now[T.flow]) > 0.05);
}

/**
 * One step of a seat's easing: toward its place, in or out, lit or dim. `instant` lands at once
 * (reduced motion). Arriving heads rise into place from a little below; leaving ones sink.
 */
export function settleSeat(seat: Seat, m: Moving, dt: number, instant: boolean): void {
  const toward = (seconds: number) => (instant ? 1 : 1 - Math.exp(-dt / seconds));
  const first = seat.here < 0.002 && seat.wanted;
  if (first) {
    // A newcomer appears where it will stand, a little low, and rises.
    Object.assign(seat.now, seat.goal);
    seat.now.y -= 6;
  }
  seat.here += ((seat.wanted ? 1 : 0) - seat.here) * toward(seat.wanted ? 0.45 : 0.35);
  if (seat.wanted) {
    const k = toward(0.6);
    seat.now.x += (seat.goal.x - seat.now.x) * k;
    seat.now.y += (seat.goal.y - seat.now.y) * k;
    seat.now.z += (seat.goal.z - seat.now.z) * k;
    seat.now.turn += (seat.goal.turn - seat.now.turn) * k;
    seat.now.scale += (seat.goal.scale - seat.now.scale) * k;
  } else seat.now.y -= 8 * dt * (instant ? 0 : 1);

  seat.quiet = sounding(m) ? 0 : seat.quiet + dt;
  const lit = seat.quiet < LINGER ? 1 : 0;
  seat.lit += (lit - seat.lit) * toward(lit > seat.lit ? 0.12 : 0.6);
}
