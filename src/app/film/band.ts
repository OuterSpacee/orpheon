// A picture of each instrument, in the look of the body (docs/look.md): drawn in dust that warms
// with sound. A string is a line of dust that takes the shape the instrument reports; a drum is a
// ring of dust that ripples; a flute is a bore of dust whose bands brighten where the air rings.
//
// What sense() writes is laid out in src/band/index.ts: the loudness at 0, then for a string its
// displacement at 32 points (8..39), for the flute the sound pressure along the pipe (8..39), for
// a drum the amplitude of each of its modes (8..23), their frequency ratios (33..48) and how loud
// each of its drums is (24..31). An instrument that reports nothing more is drawn still, warming
// as it sounds: nothing moves that the sound does not move.
import { INSTRUMENTS, INSTRUMENT_TELEMETRY_SIZE } from "../../contract.ts";
import type { InstrumentId } from "../../contract.ts";
import type { Box } from "./frames.ts";
import { drawPicture } from "./pictures.ts";

export const DUST = [201, 214, 255] as const;
export const WARM = [255, 213, 138] as const;

/** The heat ramp of the look: dust, then warm, then white. */
export function heat(h: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, h));
  if (x < 0.6) {
    const k = x / 0.6;
    return [DUST[0] + (WARM[0] - DUST[0]) * k, DUST[1] + (WARM[1] - DUST[1]) * k, DUST[2] + (WARM[2] - DUST[2]) * k];
  }
  const k = (x - 0.6) / 0.4;
  return [WARM[0] + (255 - WARM[0]) * k, WARM[1] + (255 - WARM[1]) * k, WARM[2] + (255 - WARM[2]) * k];
}

export type Kind = "string" | "drum" | "pipe";

export function kindOf(id: InstrumentId): Kind {
  const family = INSTRUMENTS.find((i) => i.id === id)?.family;
  return family === "drums" ? "drum" : family === "wind" ? "pipe" : "string";
}

/** Where a string's shape or a pipe's pressure is in sense(): 32 points from 8. */
export const SHAPE = { at: 8, points: 32 } as const;
/** Where a drum's modes are: amplitudes from 8, frequency ratios from 33, each drum's loudness from 24. */
export const DRUM = { modes: 8, ratios: 33, count: 16, drums: 24, drumCount: 8 } as const;
/**
 * How fast a drum's ripple is shown going round: its modes keep their frequency ratios but are
 * slowed to a pace the eye (and thirty frames a second) can follow.
 */
const SEEN_HZ = 1.6;

/** The profile a picture is drawn from: a string's shape or a pipe's pressure as reported, or a drum's rim. */
export function profileOf(sense: Float32Array, kind: Kind, into: Float32Array): Float32Array {
  if (sense.length < INSTRUMENT_TELEMETRY_SIZE) return into.subarray(0, 0);
  if (kind !== "drum") return sense.subarray(SHAPE.at, SHAPE.at + SHAPE.points);
  // A drum: its modes laid round the rim, the m-th with m + 1 waves around (more nodal lines for
  // the higher modes), each swinging at its own ratio of the lowest, from the moment it was struck.
  const since = Math.max(0, sense[3]);
  let peak = 0;
  for (let k = 0; k < into.length; k++) {
    const angle = (k / into.length) * Math.PI * 2;
    let v = 0;
    for (let m = 0; m < DRUM.count; m++) {
      const a = sense[DRUM.modes + m];
      const ratio = sense[DRUM.ratios + m];
      if (!a || !ratio) continue;
      v += a * Math.cos((m + 1) * angle + m) * Math.cos(2 * Math.PI * ratio * SEEN_HZ * since);
    }
    into[k] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 1) for (let k = 0; k < into.length; k++) into[k] /= peak;
  return into;
}

/** The profile's value at u (0..1 along it), straight between its points; around a ring, it wraps. */
export function along(profile: Float32Array, u: number, wrap: boolean): number {
  const n = profile.length;
  if (!n) return 0;
  if (n === 1) return profile[0];
  const x = wrap ? (((u % 1) + 1) % 1) * n : Math.min(1, Math.max(0, u)) * (n - 1);
  const i = Math.floor(x);
  const k = x - i;
  const a = profile[i % n];
  const b = profile[wrap ? (i + 1) % n : Math.min(n - 1, i + 1)];
  const v = a + (b - a) * k;
  return Math.max(-1, Math.min(1, v));
}

/** A fixed scatter for each picture, the same on every frame (a seeded generator, mulberry32). */
function scatter(seed: number, count: number): Float32Array {
  const out = new Float32Array(count * 2);
  let a = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return out;
}
const scatters = new Map<string, Float32Array>();
function dustFor(kind: Kind, index: number, count: number): Float32Array {
  const key = `${kind}${index}`;
  let s = scatters.get(key);
  if (!s) scatters.set(key, (s = scatter(index * 7919 + kind.length * 104729 + 17, count)));
  return s;
}

const MOTES = { string: 260, drum: 340, pipe: 300 } as const;
const ring = new Float32Array(64);

/**
 * Draw one instrument's picture into `box` (the name goes along its bottom). `unit` is pixels per
 * point; `index` keeps each picture's scatter its own.
 */
export function drawInstrument(ctx: CanvasRenderingContext2D, box: Box, id: InstrumentId, name: string, sense: Float32Array, unit: number, index: number, labelSize: number): void {
  const kind = kindOf(id);
  const level = Math.min(1, Math.max(0, sense[0] * 1.6));
  const profile = profileOf(sense, kind, ring);
  const label = labelSize * 1.5;
  const pic = { x: box.x + 18 * unit, y: box.y + 6 * unit, w: box.w - 36 * unit, h: box.h - label - 10 * unit };
  if (drawPicture(ctx, pic, id, sense, unit)) {
    drawName(ctx, box, name, level, unit, labelSize);
    return;
  }
  const motes = MOTES[kind];
  const s = dustFor(kind, index, motes);
  const size = 2.2 * unit;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cx = pic.x + pic.w / 2;
  const cy = pic.y + pic.h / 2;
  for (let i = 0; i < motes; i++) {
    const a = s[i * 2];
    const b = s[i * 2 + 1];
    let x: number;
    let y: number;
    let warmth: number;
    if (kind === "string") {
      // Along the string, a little scattered across it; the string's shape lifts it.
      const d = along(profile, a, false);
      x = pic.x + a * pic.w;
      // The shape is reported normalised to its largest swing; the loudness gives it its size.
      y = cy + d * pic.h * 0.42 * Math.min(1, level * 1.4) + (b - 0.5) * 4 * unit;
      warmth = level * (0.55 + 0.45 * Math.abs(d));
    } else if (kind === "drum") {
      // Most of the dust on the rim, the rest thinly over the skin; the ripple moves both.
      const rim = i < motes * 0.7;
      const angle = a * Math.PI * 2;
      const ripple = along(profile, a, true);
      // As large as the cell allows, the ellipse's height inside it.
      const r0 = Math.min(pic.w * 0.4, pic.h * 0.8);
      const swing = 0.18 * Math.min(1, level * 1.4);
      const r = rim ? r0 * (1 + swing * ripple) + (b - 0.5) * 3 * unit : r0 * Math.sqrt(b) * (1 + 0.5 * swing * ripple);
      x = cx + Math.cos(angle) * r;
      // Seen a little from above: the ring is an ellipse.
      y = cy + Math.sin(angle) * r * 0.55;
      warmth = level * (rim ? 0.7 + 0.3 * Math.abs(ripple) : 0.5);
    } else {
      // A bore: dust between two walls, brighter where the air rings.
      const ring = Math.abs(along(profile, a, false));
      x = pic.x + a * pic.w;
      y = cy + (b - 0.5) * pic.h * 0.28;
      warmth = level * (0.4 + 0.6 * ring);
    }
    const [r, g, bl] = heat(warmth);
    const alpha = 0.32 + 0.5 * warmth;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${alpha.toFixed(3)})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  // A drum set (the kit, the tabla's pair, the timpani's two) shows each of its drums as a mote
  // in a row under the ring, warming as that drum sounds.
  if (kind === "drum" && sense.length >= INSTRUMENT_TELEMETRY_SIZE) {
    const count = id === "kit" ? 8 : 2;
    const step = Math.min(18 * unit, pic.w / count);
    const y = pic.y + pic.h - 3 * unit;
    for (let d = 0; d < count; d++) {
      const loud = Math.min(1, Math.max(0, sense[DRUM.drums + d]));
      const [r, g, bl] = heat(loud);
      const x = cx + (d - (count - 1) / 2) * step;
      const half = (1.6 + 1.6 * loud) * unit;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${(0.35 + 0.6 * loud).toFixed(3)})`;
      ctx.fillRect(x - half, y - half, half * 2, half * 2);
    }
  }
  ctx.restore();

  drawName(ctx, box, name, level, unit, labelSize);
}

/** The name, quiet, warming with the instrument's loudness as the page's band names do. */
function drawName(ctx: CanvasRenderingContext2D, box: Box, name: string, level: number, unit: number, labelSize: number): void {
  const [r, g, bl] = mix(INK_2, WARM, level);
  ctx.save();
  ctx.font = `300 ${labelSize}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
  ctx.fillText(name, box.x + box.w / 2, box.y + box.h - labelSize * 0.4, box.w - 8 * unit);
  ctx.restore();
}

export const INK = [232, 236, 255] as const;
export const INK_2 = [138, 147, 184] as const;
export const INK_3 = [74, 81, 112] as const;
export const SANS = `Ysabeau, "Segoe UI", system-ui, sans-serif`;

export function mix(a: readonly number[], b: readonly number[], k: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, k));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
