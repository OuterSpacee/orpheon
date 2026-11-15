// What the offline renderer is asked for when a performance is saved: the same bodies, the same
// scores, the same levels and places as it was heard with.
import type { RenderJob } from "./audio/messages.ts";
import { sizedBody } from "./bodies.ts";
import type { Performance } from "./state.ts";

/** The level and place of a voice performing alone. */
export const SOLO = { level: 0.8, place: 0 };

export function jobFor(performance: Performance, bandLevel = 0.7): RenderJob {
  return {
    sampleRate: 48000,
    tail: 0.6,
    parts: performance.parts.map((part) => ({ body: sizedBody(part.body, part.size), score: part.score, level: part.level, place: part.place })),
    band: (performance.band ?? []).map((part) => ({ instrument: part.instrument, notes: part.notes, level: part.level, place: part.place })),
    bandLevel,
  };
}
