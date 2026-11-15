// The Score look's timeline: every voice's melody as a line of light moving right to left past a
// still line, the note being sung warming at it (warm is sound, docs/look.md), and the syllables
// along the bottom as they come. A voice with a score is drawn from it, so what is coming shows
// before it is sung; a voice played live leaves a trail of the pitch it has made.
import type { Score } from "../../contract.ts";
import { hzToMidi } from "../notes.ts";
import { INK, INK_2, INK_3, SANS, WARM, heat, mix } from "./band.ts";
import type { Box } from "./frames.ts";

/** One voice on the timeline. */
export interface Lane {
  name: string;
  /** What it will sing; null when it is played live. */
  score: Score | null;
  /** Its pitch now in Hz (0 silent) and its loudness 0..1, from its telemetry. */
  f0: number;
  level: number;
}

/** A syllable along the bottom: when it is sung, and its letters. */
export interface Syllable {
  t: number;
  text: string;
}

/**
 * Each voice in its own colour from the cold family of the look (ice, lavender, sea, pearl), so
 * the voices part without a rainbow and warm stays the sound's.
 */
export const TINTS: readonly (readonly [number, number, number])[] = [
  [178, 200, 255],
  [196, 172, 255],
  [140, 222, 220],
  [228, 226, 246],
  [150, 178, 246],
  [182, 232, 200],
];

const rgba = (c: readonly number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Sounds made without the folds: no pitch is sung through them, so the line does not run on into them. */
const VOICELESS = new Set(["p", "t", "k", "f", "s", "ʃ", "θ", "x", "h", "ʔ", "tʃ", "ts", "ç", "ɸ"]);

/** Where a score sounds: its voiced phones run together (a gap of a breath or more is a rest). */
interface Sung {
  spans: [number, number][];
  lo: number;
  hi: number;
}
const sungOf = new WeakMap<Score, Sung>();
function sung(score: Score): Sung {
  let s = sungOf.get(score);
  if (s) return s;
  const spans: [number, number][] = [];
  for (const p of score.phones) {
    if (p.ph === "_" || VOICELESS.has(p.ph)) continue;
    const last = spans[spans.length - 1];
    if (last && p.t - last[1] < 0.12) last[1] = Math.max(last[1], p.t + p.d);
    else spans.push([p.t, p.t + p.d]);
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [a, b] of spans) {
    for (let t = a; t <= b; t += 0.05) {
      const m = hzToMidi(pitchAt(score, t));
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
    }
  }
  s = { spans, lo, hi };
  sungOf.set(score, s);
  return s;
}

/** The score's pitch at t, in Hz: straight in log frequency between its points, held past the ends. */
export function pitchAt(score: Score, t: number): number {
  const p = score.pitch;
  if (!p.length) return 0;
  if (t <= p[0].t) return p[0].v;
  if (t >= p[p.length - 1].t) return p[p.length - 1].v;
  let a = 0;
  let b = p.length - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (p[m].t <= t) a = m;
    else b = m;
  }
  const k = (t - p[a].t) / Math.max(1e-9, p[b].t - p[a].t);
  return p[a].v * Math.pow(p[b].v / p[a].v, k);
}

/** A live voice's trail: the pitch it made, kept for as long as the timeline shows the past. */
class Trail {
  readonly t = new Float32Array(512);
  readonly midi = new Float32Array(512);
  readonly level = new Float32Array(512);
  head = 0;
  size = 0;
  push(t: number, midi: number, level: number): void {
    this.t[this.head] = t;
    this.midi[this.head] = midi;
    this.level[this.head] = level;
    this.head = (this.head + 1) % this.t.length;
    this.size = Math.min(this.t.length, this.size + 1);
  }
  /** The i-th oldest point. */
  at(i: number): number {
    return (this.head - this.size + i + this.t.length) % this.t.length;
  }
}

/** Seconds of past the timeline keeps, as a share of what it shows. */
const PAST = 0.3;

export class Timeline {
  private trails: Trail[] = [];
  /** Each name's height, eased, so a name does not jump when its voice rests or leaps. */
  private labelY: number[] = [];
  /** The pitch range shown, eased toward what the voices need. */
  private range: [number, number] | null = null;
  /** Seconds since the timeline began, for live trails. */
  private clock = 0;

  reset(): void {
    this.trails = [];
    this.labelY = [];
    this.range = null;
    this.clock = 0;
  }

  /**
   * Draw it into `box`. `at` is seconds into the scores (-1 when nothing is performed); `dt` the
   * seconds since the last frame; `unit` pixels per point.
   */
  draw(ctx: CanvasRenderingContext2D, box: Box, lanes: Lane[], at: number, syllables: Syllable[], dt: number, unit: number): void {
    const u = unit;
    this.clock += dt;
    // A wide frame shows more time; about 150 points to a second.
    const span = Math.max(4, box.w / (150 * u));
    const now = at >= 0 ? at : this.clock;
    const t0 = now - PAST * span;
    const wordsTall = syllables.length ? 40 * u : 0;
    const top = box.y + 16 * u;
    const bottom = box.y + box.h - wordsTall - 16 * u;
    const x = (t: number) => box.x + ((t - t0) / span) * box.w;
    const playX = x(now);

    // The live voices' trails grow while they sound.
    lanes.forEach((lane, i) => {
      if (lane.score) return;
      const trail = (this.trails[i] ??= new Trail());
      if (lane.f0 > 20 && lane.level > 0.01) trail.push(this.clock, hzToMidi(lane.f0), lane.level);
    });

    // The pitches shown: what every score sings, or what the trails hold, with a little room.
    let lo = Infinity;
    let hi = -Infinity;
    lanes.forEach((lane, i) => {
      if (lane.score) {
        const s = sung(lane.score);
        lo = Math.min(lo, s.lo);
        hi = Math.max(hi, s.hi);
      } else {
        const trail = this.trails[i];
        for (let k = 0; trail && k < trail.size; k++) {
          const j = trail.at(k);
          if (this.clock - trail.t[j] > span) continue;
          lo = Math.min(lo, trail.midi[j]);
          hi = Math.max(hi, trail.midi[j]);
        }
      }
    });
    if (!Number.isFinite(lo)) [lo, hi] = [48, 72];
    if (hi - lo < 12) [lo, hi] = [(lo + hi) / 2 - 6, (lo + hi) / 2 + 6];
    lo -= 2;
    hi += 2;
    if (!this.range) this.range = [lo, hi];
    const ease = 1 - Math.exp(-dt / 0.6);
    this.range[0] += (lo - this.range[0]) * ease;
    this.range[1] += (hi - this.range[1]) * ease;
    const [rlo, rhi] = this.range;
    const y = (midi: number) => bottom - ((midi - rlo) / (rhi - rlo)) * (bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    // Faint lines at each octave's C, so a leap reads as one.
    ctx.lineWidth = Math.max(1, 0.8 * u);
    for (let c = Math.ceil(rlo / 12) * 12; c <= rhi; c += 12) {
      ctx.strokeStyle = rgba(INK_3, 0.22);
      ctx.beginPath();
      ctx.moveTo(box.x, y(c));
      ctx.lineTo(box.x + box.w, y(c));
      ctx.stroke();
    }
    // The still line: now.
    ctx.setLineDash([2 * u, 7 * u]);
    ctx.strokeStyle = rgba(INK_2, 0.5);
    ctx.beginPath();
    ctx.moveTo(playX, box.y);
    ctx.lineTo(playX, box.y + box.h - wordsTall);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const heads: { y: number; level: number; tint: readonly number[]; name: string; i: number; singing: boolean }[] = [];
    lanes.forEach((lane, i) => {
      const tint = TINTS[i % TINTS.length];
      // The line fades into the past and is quieter in the future than at now.
      const fade = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
      const k = PAST;
      fade.addColorStop(0, rgba(tint, 0));
      fade.addColorStop(k * 0.6, rgba(tint, 0.35));
      fade.addColorStop(k, rgba(tint, 0.95));
      fade.addColorStop(Math.min(1, k + 0.02), rgba(tint, 0.6));
      fade.addColorStop(1, rgba(tint, 0.25));
      let headY = NaN;
      let singing = false;
      const step = 1 / 40;
      const path = (from: number, to: number) => {
        // Glow (a wide faint stroke) under the line itself.
        for (const [width, alpha] of [[7, 0.18], [2.2, 1]] as const) {
          ctx.lineWidth = width * u;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = fade;
          ctx.beginPath();
          for (let t = from, first = true; t <= to + 1e-9; t += step, first = false) {
            const py = y(hzToMidi(pitchAt(lane.score!, Math.min(t, to))));
            if (first) ctx.moveTo(x(t), py);
            else ctx.lineTo(x(t), py);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
      if (lane.score) {
        for (const [a, b] of sung(lane.score).spans) {
          if (b < t0 || a > t0 + span) continue;
          path(Math.max(a, t0), Math.min(b, t0 + span));
          if (a <= now && now <= b) {
            singing = true;
            headY = y(hzToMidi(pitchAt(lane.score, now)));
            // What has just been sung warms, as heat, behind the still line.
            const from = Math.max(a, now - 0.6);
            const warm = ctx.createLinearGradient(x(from), 0, playX, 0);
            warm.addColorStop(0, rgba(WARM, 0));
            warm.addColorStop(1, rgba(WARM, 0.25 + 0.75 * Math.min(1, lane.level * 1.6)));
            ctx.strokeStyle = warm;
            ctx.lineWidth = 3 * u;
            ctx.beginPath();
            for (let t = from; t <= now; t += step / 2) ctx.lineTo(x(t), y(hzToMidi(pitchAt(lane.score, t))));
            ctx.stroke();
          }
        }
        if (!singing) {
          // Resting: the name waits at the next note it will sing (or the last it sang).
          const spans = sung(lane.score).spans;
          const next = spans.find(([a]) => a > now) ?? spans[spans.length - 1];
          if (next) headY = y(hzToMidi(pitchAt(lane.score, next[0] + 0.05)));
        }
      } else {
        const trail = this.trails[i];
        if (trail && trail.size > 1) {
          // On the trail's own clock: its newest point is now.
          const offset = now - this.clock;
          ctx.strokeStyle = fade;
          ctx.lineWidth = 2.2 * u;
          ctx.beginPath();
          let last = -1;
          for (let k2 = 0; k2 < trail.size; k2++) {
            const j = trail.at(k2);
            const t = trail.t[j] + offset;
            if (t < t0) continue;
            // A gap of silence breaks the line.
            if (last >= 0 && trail.t[j] - last > 0.15) ctx.moveTo(x(t), y(trail.midi[j]));
            else ctx.lineTo(x(t), y(trail.midi[j]));
            last = trail.t[j];
          }
          ctx.stroke();
          const j = trail.at(trail.size - 1);
          headY = y(trail.midi[j]);
          singing = this.clock - trail.t[j] < 0.1;
        }
      }
      if (Number.isFinite(headY)) heads.push({ y: headY, level: lane.level, tint, name: lane.name, i, singing });
    });

    // The bead where each voice is now: warm and swelling with its sound, a quiet ring at rest.
    for (const h of heads) {
      if (!h.singing) continue;
      const level = Math.min(1, h.level * 1.6);
      const r = (4 + 5 * level) * u;
      const halo = ctx.createRadialGradient(playX, h.y, 0, playX, h.y, r * 4);
      halo.addColorStop(0, rgba(WARM, 0.45 * (0.3 + level)));
      halo.addColorStop(1, rgba(WARM, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(playX - r * 4, h.y - r * 4, r * 8, r * 8);
      ctx.fillStyle = rgba(heat(0.45 + 0.55 * level), 1);
      ctx.beginPath();
      ctx.arc(playX, h.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(h.tint, 0.9);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(playX, h.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Each voice's name at the left edge, at the height its line is now, kept apart from the others.
    const size = 20 * u;
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `300 ${size}px ${SANS}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const order = [...heads].sort((a, b) => a.y - b.y);
    const placed: number[] = [];
    for (const h of order) {
      const was = this.labelY[h.i] ?? h.y;
      let goal = was + (h.y - was) * (1 - Math.exp(-dt / 0.25));
      const prev = placed[placed.length - 1];
      if (prev !== undefined && goal < prev + size * 1.25) goal = prev + size * 1.25;
      goal = Math.max(top, Math.min(bottom, goal));
      this.labelY[h.i] = goal;
      placed.push(goal);
      if (!h.name) continue;
      ctx.fillStyle = rgba(mix(h.tint, INK, h.singing ? 0.4 : 0), h.singing ? 0.95 : 0.5);
      ctx.fillText(h.name, box.x, goal);
    }

    // The syllables along the bottom, at the moments they are sung; the one being sung is warm.
    if (syllables.length) {
      const sy = box.y + box.h - wordsTall / 2;
      ctx.font = `300 ${24 * u}px ${SANS}`;
      ctx.textAlign = "left";
      let current = -1;
      for (let i = 0; i < syllables.length; i++) if (syllables[i].t <= now + 1e-6) current = i;
      let right = -Infinity;
      for (let i = 0; i < syllables.length; i++) {
        const s = syllables[i];
        const sx = x(s.t);
        if (sx > box.x + box.w) break;
        const width = ctx.measureText(s.text).width;
        if (sx + width < box.x || sx < right) continue;
        right = sx + width + 6 * u;
        const past = Math.max(0, Math.min(1, (playX - sx) / (playX - box.x)));
        ctx.fillStyle = i === current ? rgba(WARM, 1) : i < current ? rgba(INK_2, 0.9 - 0.8 * past) : rgba(INK, 0.75);
        ctx.fillText(s.text, sx, sy);
      }
    }
    ctx.restore();
  }
}
