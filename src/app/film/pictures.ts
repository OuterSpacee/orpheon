// Each instrument drawn as itself: its body a faint line of light, its strings (or heads, or keys)
// the part that moves. A string takes the shape the instrument reports for its loudest string,
// scaled by how loud each string is, and warms as it sounds; a drum's head ripples with its modes.
// Nothing moves that the sound does not move (docs/look.md).
//
// What sense() writes is laid out in src/band/index.ts; the readers here are band.ts's.
import { INSTRUMENT_TELEMETRY_SIZE } from "../../contract.ts";
import type { InstrumentId } from "../../contract.ts";
import { PLAYABLE } from "../../band/ranges.ts";
import { DRUM, DUST, along, heat, profileOf } from "./band.ts";
import type { Box } from "./frames.ts";

/** Where the sounding notes are in sense(): pairs (midi, loudness) from 40, up to 12. */
const NOTES = { at: 40, count: 12 } as const;

const rgba = (c: readonly number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** The instruments drawn here; the others keep band.ts's cloud of dust. */
export const PICTURED = new Set<InstrumentId>(["harp", "tanpura", "sarod", "esraj", "strings", "guitar", "bass", "tabla", "timpani", "piano"]);

/** How wide each picture is for its height. */
const ASPECT: Partial<Record<InstrumentId, number>> = { harp: 0.95, tabla: 1.7, timpani: 1.9, piano: 3.2 };

/** How loud each of `n` strings is: every sounding note given to the string nearest its pitch. */
function stringLevels(sense: Float32Array, id: InstrumentId, n: number, into: Float32Array): Float32Array {
  into.fill(0);
  const [lo, hi] = PLAYABLE[id];
  let any = false;
  for (let k = 0; k < NOTES.count; k++) {
    const midi = sense[NOTES.at + 2 * k];
    const loud = sense[NOTES.at + 2 * k + 1];
    if (!(midi > 0) || !(loud > 0)) continue;
    const i = Math.max(0, Math.min(n - 1, Math.round(((midi - lo) / Math.max(1, hi - lo)) * (n - 1))));
    into[i] = Math.max(into[i], Math.min(1, loud));
    any = true;
  }
  // An instrument that does not say which notes sound: its loudness on the string of its last note.
  if (!any && sense[0] > 0.005) {
    const midi = sense[2];
    const i = midi > 0 ? Math.max(0, Math.min(n - 1, Math.round(((midi - lo) / Math.max(1, hi - lo)) * (n - 1)))) : n >> 1;
    into[i] = Math.min(1, sense[0] * 1.6);
  }
  return into;
}

const levels = new Float32Array(32);
const rim = new Float32Array(64);

/** A body's line: a wide faint glow under a thin line, both dust, warming a little with the sound. */
function line(ctx: CanvasRenderingContext2D, u: number, warmth: number, draw: () => void): void {
  const c = heat(warmth * 0.5);
  ctx.beginPath();
  draw();
  ctx.lineWidth = 6 * u;
  ctx.strokeStyle = rgba(c, 0.05 + 0.08 * warmth);
  ctx.stroke();
  ctx.lineWidth = 1.2 * u;
  ctx.strokeStyle = rgba(c, 0.42 + 0.3 * warmth);
  ctx.stroke();
}

/**
 * A string from (x0, y0) to (x1, y1), pushed sideways by the reported shape `profile` (0 at one end,
 * 1 at the other) times `swing` pixels; `loud` warms it. `flip` mirrors its swing, so neighbouring
 * strings do not move as one.
 */
function string(ctx: CanvasRenderingContext2D, u: number, x0: number, y0: number, x1: number, y1: number, profile: Float32Array, swing: number, loud: number, flip: boolean, thin = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = swing * loud * (flip ? -1 : 1);
  const steps = loud > 0.01 ? 28 : 1;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const d = loud > 0.01 ? along(profile, s, false) * amp : 0;
    const x = x0 + dx * s + nx * d;
    const y = y0 + dy * s + ny * d;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  const c = heat(Math.min(1, 0.15 + loud));
  if (loud > 0.02) {
    ctx.lineWidth = (5 + 6 * loud) * u * thin;
    ctx.strokeStyle = rgba(c, 0.18 * loud);
    ctx.stroke();
  }
  ctx.lineWidth = (0.9 + 0.9 * loud) * u * thin;
  ctx.strokeStyle = rgba(loud > 0.02 ? c : DUST, 0.38 + 0.6 * loud);
  ctx.stroke();
}

/** A drumhead seen a little from above: an ellipse whose rim ripples by `ripple` and warms by `loud`. */
function head(ctx: CanvasRenderingContext2D, u: number, cx: number, cy: number, rx: number, ry: number, ripple: Float32Array | null, loud: number): void {
  const n = 48;
  const swing = 0.16 * Math.min(1, loud * 1.4);
  for (const [scale, alpha] of [[1, 1], [0.62, 0.45], [0.3, 0.3]] as const) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + (ripple ? swing * scale * along(ripple, i / n, true) : 0);
      const x = cx + Math.cos(a) * rx * scale * r;
      const y = cy + Math.sin(a) * ry * scale * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const c = heat(Math.min(1, 0.1 + loud));
    if (loud > 0.02 && scale === 1) {
      ctx.lineWidth = (5 + 7 * loud) * u;
      ctx.strokeStyle = rgba(c, 0.2 * loud);
      ctx.stroke();
    }
    ctx.lineWidth = (scale === 1 ? 1.3 + loud : 0.9) * u;
    ctx.strokeStyle = rgba(c, (0.3 + 0.6 * loud) * alpha);
    ctx.stroke();
  }
}

/**
 * A bowed instrument's body lying along x from `x0` to `x1` about `cy`: wide lower bouts, a waist,
 * narrower upper bouts (a violin's, or a double bass's with its sloping shoulders), then the f-holes.
 */
function fiddle(ctx: CanvasRenderingContext2D, x0: number, x1: number, cy: number, half: number, shoulders: number): void {
  const bump = (s: number, at: number, wide: number) => Math.exp(-(((s - at) / wide) ** 2));
  const width = (s: number) => half * Math.pow(Math.sin(Math.PI * s), 0.35) * Math.max(0.56, bump(s, 0.28, 0.24), shoulders * bump(s, 0.8, 0.2));
  const n = 40;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= n; i++) {
      const s2 = i / n;
      const x = x0 + (x1 - x0) * s2;
      const y = cy + side * width(s2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  for (const side of [-1, 1]) {
    const x = x0 + (x1 - x0) * 0.5;
    ctx.moveTo(x - half * 0.12, cy + side * half * 0.42);
    ctx.quadraticCurveTo(x, cy + side * half * 0.3, x + half * 0.12, cy + side * half * 0.42);
  }
}

/** Draw `id` into `pic`. Returns false for an instrument this file does not picture. */
export function drawPicture(ctx: CanvasRenderingContext2D, pic: Box, id: InstrumentId, sense: Float32Array, u: number): boolean {
  if (!PICTURED.has(id)) return false;
  const full = sense.length >= INSTRUMENT_TELEMETRY_SIZE;
  const level = Math.min(1, Math.max(0, sense[0] * 1.6));
  const profile = full && id !== "tabla" && id !== "timpani" ? profileOf(sense, "string", rim) : rim.subarray(0, 0);
  // The picture keeps its own proportions inside the cell, centred.
  const aspect = ASPECT[id] ?? 2.6;
  const W = Math.min(pic.w, pic.h * aspect);
  const H = W / aspect;
  const X = pic.x + (pic.w - W) / 2;
  const Y = pic.y + (pic.h - H) / 2;
  const px = (fx: number) => X + fx * W;
  const py = (fy: number) => Y + fy * H;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (id) {
    case "harp": {
      // The pillar on the left, the curved neck across the top, the soundboard falling to the
      // right; the strings between neck and board, the long low ones nearest the pillar.
      // The neck's S: up from the pillar, a dip, and up again to meet the board.
      const neck = (fx: number) => {
        const k = (fx - 0.1) / 0.82;
        return 0.05 + 0.3 * k + 0.07 * Math.sin(2 * Math.PI * k);
      };
      const board = (fx: number) => 0.95 - ((fx - 0.1) / 0.82) * 0.62;
      line(ctx, u, level, () => {
        ctx.moveTo(px(0.1), py(0.97));
        ctx.lineTo(px(0.1), py(0.04));
        for (let i = 0; i <= 20; i++) {
          const fx = 0.1 + (0.82 * i) / 20;
          ctx.lineTo(px(fx), py(neck(fx)));
        }
        ctx.lineTo(px(0.92), py(board(0.92)));
        ctx.lineTo(px(0.1), py(0.97));
      });
      const n = 15;
      stringLevels(sense, id, n, levels);
      for (let i = 0; i < n; i++) {
        const fx = 0.17 + (0.7 * i) / (n - 1);
        string(ctx, u, px(fx), py(neck(fx) + 0.02), px(fx), py(board(fx) - 0.01), profile, W * 0.05, levels[i], i % 2 === 1, 0.9);
      }
      break;
    }
    case "tanpura":
    case "sarod": {
      // Lying along the cell: the round body at the left, the neck to the right.
      const sarod = id === "sarod";
      line(ctx, u, level, () => {
        ctx.ellipse(px(0.17), py(0.5), W * (sarod ? 0.15 : 0.15), H * (sarod ? 0.4 : 0.44), 0, 0, Math.PI * 2);
        if (sarod) {
          // The skin of the belly, and a neck that narrows to the pegs.
          ctx.moveTo(px(0.17) + W * 0.09, py(0.5));
          ctx.ellipse(px(0.17), py(0.5), W * 0.09, H * 0.25, 0, 0, Math.PI * 2);
          ctx.moveTo(px(0.3), py(0.36));
          ctx.lineTo(px(0.95), py(0.42));
          ctx.lineTo(px(0.95), py(0.58));
          ctx.lineTo(px(0.3), py(0.64));
        } else {
          ctx.moveTo(px(0.31), py(0.42));
          ctx.lineTo(px(0.97), py(0.42));
          ctx.lineTo(px(0.97), py(0.58));
          ctx.lineTo(px(0.31), py(0.58));
        }
      });
      // The pegs.
      line(ctx, u, level * 0.5, () => {
        for (let k = 0; k < (sarod ? 4 : 2); k++) {
          const x = px(0.86 + 0.035 * k);
          ctx.moveTo(x, py(0.42));
          ctx.lineTo(x, py(0.3));
          ctx.moveTo(x, py(0.58));
          ctx.lineTo(x, py(0.7));
        }
      });
      const n = sarod ? 6 : 4;
      stringLevels(sense, id, n, levels);
      for (let i = 0; i < n; i++) {
        const fy = 0.5 + ((i - (n - 1) / 2) / (n - 1)) * (sarod ? 0.11 : 0.1);
        string(ctx, u, px(0.07), py(fy), px(0.94), py(fy), profile, H * 0.14, levels[n - 1 - i], i % 2 === 1);
      }
      if (sarod) {
        // The sympathetic strings under the main ones ring with whatever is played.
        for (let i = 0; i < 7; i++) {
          const fy = 0.63 + i * 0.012;
          string(ctx, u, px(0.1), py(fy), px(0.52 + i * 0.04), py(fy - 0.02), profile, H * 0.02, level * 0.35, i % 2 === 0, 0.6);
        }
      }
      break;
    }
    case "esraj":
    case "strings": {
      // A fingerboard seen from above: the strings across it, frets on the esraj, and the bow
      // crossing near the bridge, drawn back and forth as a note is held.
      const esraj = id === "esraj";
      line(ctx, u, level, () => {
        if (esraj) {
          ctx.rect(px(0.03), py(0.22), W * 0.2, H * 0.56);
          ctx.moveTo(px(0.23), py(0.32));
          ctx.lineTo(px(0.97), py(0.36));
          ctx.moveTo(px(0.23), py(0.68));
          ctx.lineTo(px(0.97), py(0.64));
        } else {
          // A violin's outline under its strings, its neck ending in the scroll.
          fiddle(ctx, px(0.03), px(0.47), py(0.5), H * 0.44, 0.82);
          ctx.moveTo(px(0.985), py(0.5));
          ctx.arc(px(0.97), py(0.5), H * 0.07, 0, Math.PI * 2);
          ctx.moveTo(px(0.47), py(0.44));
          ctx.lineTo(px(0.94), py(0.45));
          ctx.lineTo(px(0.94), py(0.55));
          ctx.lineTo(px(0.47), py(0.56));
        }
      });
      if (esraj)
        line(ctx, u, 0, () => {
          for (let k = 0; k < 14; k++) {
            const x = px(0.3 + 0.65 * (1 - Math.pow(0.88, k)) / (1 - Math.pow(0.88, 14)));
            ctx.moveTo(x, py(0.34));
            ctx.lineTo(x, py(0.66));
          }
        });
      const n = 4;
      stringLevels(sense, id, n, levels);
      for (let i = 0; i < n; i++) {
        const fy = 0.5 + (i - 1.5) * (esraj ? 0.075 : 0.03);
        string(ctx, u, px(0.06), py(fy), px(0.95), py(fy), profile, H * 0.12, levels[n - 1 - i], i % 2 === 1);
      }
      if (esraj)
        for (let i = 0; i < 9; i++) {
          const fy = 0.25 + i * 0.006;
          string(ctx, u, px(0.08), py(fy + 0.45), px(0.9), py(fy + 0.5), profile, H * 0.015, level * 0.3, i % 2 === 0, 0.5);
        }
      // The bow: a long line slanted over the strings, sliding with time while a note sounds.
      if (full && sense[3] >= 0) {
        const t = sense[3];
        const slide = 0.5 + 0.5 * Math.sin(t * 0.9);
        const bx = px(0.12 + 0.12 * slide);
        const c = heat(level * 0.6);
        ctx.lineWidth = 1.4 * u;
        ctx.strokeStyle = rgba(c, 0.25 + 0.45 * level);
        ctx.beginPath();
        ctx.moveTo(bx - W * 0.05, py(0.05));
        ctx.lineTo(bx + W * 0.05, py(0.95));
        ctx.stroke();
      }
      break;
    }
    case "guitar":
    case "bass": {
      const bass = id === "bass";
      line(ctx, u, level, () => {
        if (bass) {
          // A double bass: a fiddle's body with sloping shoulders, and its scroll.
          fiddle(ctx, px(0.02), px(0.5), py(0.5), H * 0.47, 0.7);
          ctx.moveTo(px(0.985), py(0.5));
          ctx.arc(px(0.97), py(0.5), H * 0.08, 0, Math.PI * 2);
        } else {
          ctx.ellipse(px(0.16), py(0.5), W * 0.14, H * 0.44, 0, 0, Math.PI * 2);
          ctx.moveTo(px(0.36) + W * 0.1, py(0.5));
          ctx.ellipse(px(0.36), py(0.5), W * 0.1, H * 0.34, 0, 0, Math.PI * 2);
          ctx.moveTo(px(0.3) + H * 0.12, py(0.5));
          ctx.arc(px(0.3), py(0.5), H * 0.12, 0, Math.PI * 2);
        }
        const from = px(bass ? 0.5 : 0.46);
        ctx.moveTo(from, py(0.43));
        ctx.lineTo(px(0.94), py(0.44));
        ctx.lineTo(px(0.94), py(0.56));
        ctx.lineTo(from, py(0.57));
      });
      if (!bass)
        line(ctx, u, 0, () => {
          for (let k = 0; k < 12; k++) {
            const x = px(0.5 + 0.45 * (1 - Math.pow(0.94, k * 1.6)) / (1 - Math.pow(0.94, 19)));
            ctx.moveTo(x, py(0.44));
            ctx.lineTo(x, py(0.56));
          }
        });
      const n = bass ? 4 : 6;
      stringLevels(sense, id, n, levels);
      for (let i = 0; i < n; i++) {
        const fy = 0.5 + ((i - (n - 1) / 2) / (n - 1)) * 0.09;
        string(ctx, u, px(0.1), py(fy), px(0.95), py(fy), profile, H * 0.14, levels[n - 1 - i], i % 2 === 1, bass ? 1.3 : 1);
      }
      break;
    }
    case "tabla":
    case "timpani": {
      // Two drums side by side, each warming as it sounds; the one struck last ripples with its modes.
      const ripple = full ? profileOf(sense, "drum", rim) : null;
      const last = full ? sense[DRUM.drums + 8] : -1;
      const drums =
        id === "tabla"
          ? // the bayan (wide and low) on the left, the dayan (narrow and tall) on the right
            [
              { cx: 0.3, top: 0.3, rx: 0.24, ry: 0.13, down: 0.62, foot: 0.17 },
              { cx: 0.76, top: 0.22, rx: 0.15, ry: 0.09, down: 0.72, foot: 0.12 },
            ]
          : [
              { cx: 0.27, top: 0.3, rx: 0.23, ry: 0.11, down: 0.55, foot: 0.06 },
              { cx: 0.74, top: 0.34, rx: 0.2, ry: 0.1, down: 0.5, foot: 0.05 },
            ];
      drums.forEach((d, i) => {
        const loud = full ? Math.min(1, Math.max(0, sense[DRUM.drums + i] * 1.4)) : level;
        // The shell: from the head's rim down to its foot.
        line(ctx, u, loud * 0.6, () => {
          ctx.moveTo(px(d.cx - d.rx), py(d.top));
          ctx.bezierCurveTo(px(d.cx - d.rx * 1.05), py(d.top + d.down * 0.7), px(d.cx - d.foot), py(d.top + d.down), px(d.cx), py(d.top + d.down));
          ctx.bezierCurveTo(px(d.cx + d.foot), py(d.top + d.down), px(d.cx + d.rx * 1.05), py(d.top + d.down * 0.7), px(d.cx + d.rx), py(d.top));
        });
        head(ctx, u, px(d.cx), py(d.top), W * d.rx, H * d.ry, last === i || drums.length === 1 ? ripple : null, loud);
      });
      break;
    }
    case "piano": {
      // Five octaves of keys; the ones sounding lit by how loud they are.
      const lo = 36;
      const hi = 96;
      const whites: number[] = [];
      for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      const kw = W / whites.length;
      const lit = new Map<number, number>();
      for (let k = 0; k < NOTES.count; k++) {
        const midi = Math.round(sense[NOTES.at + 2 * k]);
        const loud = sense[NOTES.at + 2 * k + 1];
        if (midi > 0 && loud > 0) lit.set(midi, Math.max(lit.get(midi) ?? 0, Math.min(1, loud)));
      }
      whites.forEach((m, i) => {
        const loud = lit.get(m) ?? 0;
        const c = heat(Math.min(1, 0.1 + loud));
        if (loud > 0.02) {
          ctx.fillStyle = rgba(c, 0.15 + 0.5 * loud);
          ctx.fillRect(X + i * kw + 1, Y + H * 0.15, kw - 2, H * 0.7);
        }
        ctx.lineWidth = 0.9 * u;
        ctx.strokeStyle = rgba(c, 0.3 + 0.5 * loud);
        ctx.strokeRect(X + i * kw + 1, Y + H * 0.15, kw - 2, H * 0.7);
      });
      let wi = 0;
      for (let m = lo; m <= hi; m++) {
        const black = [1, 3, 6, 8, 10].includes(m % 12);
        if (!black) {
          wi++;
          continue;
        }
        const loud = lit.get(m) ?? 0;
        const c = heat(Math.min(1, 0.1 + loud));
        const x = X + wi * kw - kw * 0.3;
        ctx.fillStyle = rgba([3, 4, 9], 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillRect(x, Y + H * 0.15, kw * 0.6, H * 0.42);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(c, loud > 0.02 ? 0.2 + 0.5 * loud : 0.06);
        ctx.fillRect(x, Y + H * 0.15, kw * 0.6, H * 0.42);
      }
      break;
    }
  }
  ctx.restore();
  return true;
}
