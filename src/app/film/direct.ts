// What the camera's director (view/director.ts) is told about a performance: when each head on
// the stage sings, the song's lines, and the band's notes, all on the performance's clock. The
// shot list made from it is the same for the same performance and seed, so a fast recording made
// twice is framed the same.
import { planShots } from "../../view/director.ts";
import type { Music, Plan } from "../../view/director.ts";
import type { Performance } from "../state.ts";
import { wordLines } from "./overlay.ts";
import type { Singer } from "./overlay.ts";

/** Sounds made without the folds, and rests: a head is not singing through them. */
const SILENT = new Set(["_", "p", "t", "k", "f", "s", "ʃ", "θ", "x", "h", "ʔ", "tʃ", "ts", "ç", "ɸ"]);

/** The music of a performance, for the heads as they stand (`singers`, in the cast's order). */
export function musicOf(p: Performance, singers: readonly Singer[]): Music {
  const voices = singers.map((singer) => {
    const score = p.parts[singer.seat]?.score;
    const spans: [number, number][] = [];
    for (const ph of score?.phones ?? []) {
      if (SILENT.has(ph.ph)) continue;
      const last = spans[spans.length - 1];
      if (last && ph.t - last[1] < 0.12) last[1] = Math.max(last[1], ph.t + ph.d);
      else spans.push([ph.t, ph.t + ph.d]);
    }
    return spans;
  });
  const lead = p.parts[0]?.score;
  const captions = p.captions?.length ? p.captions : lead ? wordLines(lead, p.parts.slice(1).map((x) => x.score)) : [];
  const length = Math.max(0, ...p.parts.map((x) => x.score.length), ...(p.band ?? []).flatMap((x) => x.notes.map((n) => n.t + n.d)));
  return {
    length,
    voices,
    lines: captions.map((c) => [c.t0, c.t1] as const),
    band: (p.band ?? []).flatMap((x) => x.notes.map((n) => ({ t: n.t, d: n.d, velocity: n.velocity * x.level }))),
  };
}

const made = new WeakMap<Performance, { key: string; plan: Plan }>();

/** The shot list for a performance, made once for each seed and strength. */
export function planFor(p: Performance, singers: readonly Singer[], seed: number, strength: number): Plan {
  const key = `${seed}:${strength}:${singers.map((s) => s.seat).join(",")}`;
  const was = made.get(p);
  if (was && was.key === key) return was.plan;
  const plan = planShots(musicOf(p, singers), seed, strength);
  made.set(p, { key, plan });
  return plan;
}
