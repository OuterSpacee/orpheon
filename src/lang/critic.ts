/**
 * The critic: an arranger's second opinion. The planner (staging.ts) can stage a song many ways:
 * everyone in earlier or later, the voices in another order, humming or singing the words while
 * the choir builds, the men's and women's phrases one way round or the other, or none. Each is
 * written out and judged here, and the best is sung; "Try another" on the page asks for the next.
 *
 *   shape    the plan as a listener feels it: a peak about the middle, the voices coming in one
 *            at a time, a strain sung twice running never the same twice, every voice given
 *            enough to sing, a long song's return made felt by a lighter phrase before it
 *   voices   the plan as a choirmaster hears it, among the voices that actually sound in each
 *            phrase: no crossing parts, no parallel fifths or octaves, every part in its range,
 *            the women's duet really in thirds and sixths
 *
 * Scores are sums of small rewards and penalties; only their order matters. Everything is
 * deterministic, so a song gets the same plan every time, and the same "next" one.
 */
import type { StageOptions, Staging } from "./staging.ts";
import { RANGES } from "./voicing.ts";
import type { NoteIn } from "./index.ts";

/** Every plan worth trying for `k` lines (the tune first), the arranger's first choice first. */
export function choices(k: number): StageOptions[] {
  const orders: number[][] = k === 4 ? [[1, 2, 3], [1, 3, 2], [3, 1, 2]] : k > 2 ? [[...Array(k - 1).keys()].map((i) => i + 1), [...Array(k - 1).keys()].map((i) => k - 1 - i)] : [[1]];
  const out: StageOptions[] = [];
  for (const fullAt of [0.45, 0.35, 0.55])
    for (const breather of ["men-women", "women-men", "none"] as const)
      for (const hum of [true, false])
        for (const order of orders) out.push({ fullAt, breather, hum, order });
  return out;
}

/** What someone (the AI arranger) would rather have: the critic weighs a plan that agrees higher. */
export interface Prefer {
  fullAt?: number;
  breather?: "men-women" | "women-men" | "none";
  hum?: boolean;
  /** The voice that joins the tune first. */
  first?: "alto" | "tenor" | "bass";
}

/** How much a plan agrees with what is preferred: a point for each choice that matches. */
export function agreement(choice: StageOptions, prefer: Prefer | undefined, names: readonly string[]): number {
  if (!prefer) return 0;
  let points = 0;
  if (prefer.fullAt !== undefined && choice.fullAt === prefer.fullAt) points++;
  if (prefer.breather !== undefined && choice.breather === prefer.breather) points++;
  if (prefer.hum !== undefined && choice.hum === prefer.hum) points++;
  if (prefer.first !== undefined && choice.order?.length && names[choice.order[0]]?.toLowerCase() === prefer.first) points++;
  return points;
}

/** What tells two plans apart, to offer only different ones. */
export function signature(s: Staging): string {
  return s.phrases.map((p) => `${p.lines.join(".")}/${p.hum.join(".")}/${p.texture}`).join("|");
}

/** How unlike two plans of the same song are, 0..1: the share of phrases sung another way. */
export function distance(a: Staging, b: Staging): number {
  const n = Math.min(a.phrases.length, b.phrases.length) || 1;
  let differ = 0;
  for (let i = 0; i < n; i++) {
    const x = a.phrases[i];
    const y = b.phrases[i];
    if (x.lines.join() !== y.lines.join() || x.hum.join() !== y.hum.join() || x.texture !== y.texture) differ++;
  }
  return differ / n;
}

/**
 * The plans in the order "Try another" offers them: the best first, then each time the one that
 * is best and most unlike those already offered, so the next is a real alternative.
 */
export function offerOrder<T extends { staging: Staging; score: number }>(tried: readonly T[]): T[] {
  if (!tried.length) return [];
  const rest = [...tried].sort((a, b) => b.score - a.score);
  const out = [rest.shift()!];
  while (rest.length) {
    let best = 0;
    let bestValue = -Infinity;
    rest.forEach((r, i) => {
      const unlike = Math.min(...out.map((o) => distance(o.staging, r.staging)));
      const value = r.score + 3 * unlike;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    });
    out.push(rest.splice(best, 1)[0]);
  }
  return out;
}

/** The plan's shape. `names` are the lines in entry order (the tune first); `slow` a tune of 100 bpm or less. */
export function shapeScore(s: Staging, names: readonly string[], slow: boolean): number {
  const ph = s.phrases;
  const n = ph.length;
  const k = names.length;
  if (n < 2 || k < 2) return 0;
  let score = 0;
  const full = Math.max(0, ph.findIndex((p) => p.lines.length === k));
  // the peak about the middle
  score -= 6 * Math.abs(full / n - 0.45);
  // one voice at a time while the choir builds
  for (let i = 1; i <= full; i++) score -= 0.8 * Math.max(0, ph[i].lines.filter((l) => !ph[i - 1].lines.includes(l)).length - 1);
  // a long song's return is felt after a lighter phrase
  if (n >= 7 && ph.some((p) => p.texture !== "all")) score += 1.2;
  // a strain sung twice running is not sung the same way twice
  for (let i = 1; i < n; i++) {
    const a = ph[i - 1];
    const b = ph[i];
    if (a.label === b.label && a.texture === b.texture && a.lines.join() === b.lines.join() && a.hum.join() === b.hum.join()) score -= 0.6;
  }
  // every voice is given enough to sing
  for (let l = 0; l < k; l++) {
    const share = ph.filter((p) => p.lines.includes(l)).length / n;
    if (share < 0.4) score -= 2 * (0.4 - share);
  }
  // humming suits a slow song; words carry a quick one along
  const hums = ph.some((p) => p.hum.length > 0);
  if (slow && hums) score += 0.4;
  if (!slow && !hums) score += 0.2;
  // the sweetest first duet is the alto's under the tune; the bass early gives the band a floor
  const first = ph.find((p) => p.lines.length > 1)?.lines.find((l) => l !== 0);
  if (first !== undefined && names[first]?.toLowerCase() === "alto") score += 0.3;
  return score;
}

/** A line as the critic hears it: its part and its notes (on the tune's moments), and where it rests. */
export interface Heard {
  part: "descant" | "soprano" | "alto" | "tenor" | "bass" | "double";
  notes: readonly NoteIn[];
}

const RANK: Record<Heard["part"], number> = { descant: 0, soprano: 1, double: 1, alto: 2, tenor: 3, bass: 4 };

/**
 * The voices as written for the plan: `lines` in the arrangement's order, `staging` with lines in
 * that order too. Only the lines that sound in a phrase are judged against each other there.
 */
export function voicesScore(lines: readonly Heard[], staging: Staging, tuneLine: number): number {
  let score = 0;
  const at = (line: Heard, t: number) => line.notes.find((n) => Math.abs(n.t - t) < 1e-6)?.midi;
  const tune = lines[tuneLine].notes;
  for (const p of staging.phrases) {
    const moments = tune.filter((n) => n.t >= p.t - 1e-6 && n.t < p.end - 1e-6).map((n) => n.t);
    const sounding = p.lines.filter((l) => !p.hum.includes(l)).map((l) => lines[l]);
    let before: (number | undefined)[] | null = null;
    for (const t of moments) {
      const now = sounding.map((line) => at(line, t));
      sounding.forEach((line, i) => {
        const m = now[i];
        if (m === undefined) return;
        const range = RANGES[line.part === "double" ? "soprano" : line.part];
        if (m < range[0] || m > range[1]) score -= 0.3;
        for (let j = 0; j < sounding.length; j++) {
          const other = sounding[j];
          const o = now[j];
          if (j === i || o === undefined || RANK[other.part] <= RANK[line.part]) continue;
          // `other` is the lower part: it must not sound above
          if (o > m) score -= 0.5;
          if (before) {
            const m0 = before[i];
            const o0 = before[j];
            if (m0 !== undefined && o0 !== undefined && m0 !== m && o0 !== o && Math.sign(m - m0) === Math.sign(o - o0)) {
              const was = (((m0 - o0) % 12) + 12) % 12;
              const is = (((m - o) % 12) + 12) % 12;
              if (was === is && (is === 0 || is === 7)) score -= 0.4;
            }
          }
        }
      });
      before = now;
    }
    if (p.texture === "women") {
      const alto = sounding.find((x) => x.part === "alto");
      if (alto) {
        const thirds = moments.filter((t) => {
          const a = at(alto, t);
          const s = at(lines[tuneLine], t);
          return a !== undefined && s !== undefined && [3, 4, 8, 9].includes(s - a);
        }).length;
        score += moments.length ? thirds / moments.length : 0;
      }
    }
  }
  return score;
}
