// Every decoration: how it is made, and how it is drawn. Each is a cloud of light like the
// anatomy, layered over it (its light adds to the body's), in the cold family of the look: silver,
// pearl, ice, lavender, sea. The warm gold is the sound's and stays the sound's, so no crown is
// gold. With "Colour" turned up each takes its own hues (a red Santa hat, orange marigolds), still
// never the sound's gold.
import type { Part } from "../dust.ts";
import { roundGlasses, sunglasses } from "./glasses.ts";
import { BANDS, beanie, captainCap, crown, garland, santaHat, tiara, topHat, turban } from "./hats.ts";
import { bindi, hoops, jhumkas, nath, pearls, studs, tikka } from "./jewels.ts";
import type { HeadwearId, ItemId } from "./outfit.ts";
import { Maker } from "./shapes.ts";

type Rgb = readonly [number, number, number];

export interface ItemStyle {
  /** Its own colour, and its accent's (a hat's band, a stone), in the cold look and in full colour. */
  tint: Rgb;
  accent: Rgb;
  vivid: Rgb;
  vividAccent: Rgb;
  /** Brightness of each mote, as the anatomy's gains. */
  gain: number;
  /** 0 a soft glow all over .. 1 clear face-on, bright at its edges (a hat is a glass shell; a stone is not). */
  edge: number;
}

const SILVER: Rgb = [0.9, 0.92, 1.0];
const PEARL: Rgb = [0.96, 0.94, 1.0];
const ICE: Rgb = [0.66, 0.86, 1.0];
const LAVENDER: Rgb = [0.82, 0.76, 1.0];
const SEA: Rgb = [0.58, 0.9, 0.88];

export const ITEM_STYLE: Record<ItemId, ItemStyle> = {
  crown: { tint: SILVER, accent: ICE, vivid: [0.92, 0.94, 1.0], vividAccent: [0.35, 0.5, 1.0], gain: 1.5, edge: 0.4 },
  tiara: { tint: SILVER, accent: ICE, vivid: [0.95, 0.96, 1.0], vividAccent: [0.45, 0.7, 1.0], gain: 2.4, edge: 0.2 },
  garland: { tint: LAVENDER, accent: SEA, vivid: [1.0, 0.5, 0.16], vividAccent: [0.35, 0.85, 0.35], gain: 3.0, edge: 0.05 },
  turban: { tint: ICE, accent: PEARL, vivid: [0.95, 0.3, 0.55], vividAccent: [0.95, 0.95, 1.0], gain: 1.3, edge: 0.4 },
  tophat: { tint: LAVENDER, accent: ICE, vivid: [0.5, 0.48, 0.95], vividAccent: [0.9, 0.3, 0.45], gain: 1.1, edge: 0.45 },
  beanie: { tint: ICE, accent: SEA, vivid: [0.3, 0.75, 0.75], vividAccent: [0.92, 0.95, 1.0], gain: 1.25, edge: 0.35 },
  santa: { tint: LAVENDER, accent: PEARL, vivid: [1.0, 0.22, 0.3], vividAccent: [1.0, 1.0, 1.0], gain: 1.8, edge: 0.35 },
  captain: { tint: PEARL, accent: [0.5, 0.62, 1.0], vivid: [1.0, 1.0, 1.0], vividAccent: [0.22, 0.3, 0.8], gain: 1.0, edge: 0.4 },
  studs: { tint: ICE, accent: ICE, vivid: [0.8, 0.95, 1.0], vividAccent: [0.8, 0.95, 1.0], gain: 3.0, edge: 0.1 },
  hoops: { tint: SILVER, accent: SILVER, vivid: [0.92, 0.93, 1.0], vividAccent: [0.92, 0.93, 1.0], gain: 2.2, edge: 0.15 },
  jhumkas: { tint: SILVER, accent: PEARL, vivid: [0.92, 0.93, 1.0], vividAccent: [1.0, 0.45, 0.55], gain: 2.2, edge: 0.2 },
  nath: { tint: SILVER, accent: LAVENDER, vivid: [0.95, 0.95, 1.0], vividAccent: [1.0, 0.3, 0.45], gain: 4.0, edge: 0.15 },
  tikka: { tint: SILVER, accent: LAVENDER, vivid: [0.95, 0.95, 1.0], vividAccent: [1.0, 0.28, 0.4], gain: 3.0, edge: 0.15 },
  bindi: { tint: LAVENDER, accent: LAVENDER, vivid: [1.0, 0.2, 0.32], vividAccent: [1.0, 0.2, 0.32], gain: 2.6, edge: 0.05 },
  pearls: { tint: PEARL, accent: [1.0, 1.0, 1.0], vivid: [1.0, 0.95, 0.96], vividAccent: [1.0, 1.0, 1.0], gain: 2.8, edge: 0.3 },
  glasses: { tint: SILVER, accent: ICE, vivid: [0.55, 0.6, 0.95], vividAccent: [0.7, 0.9, 1.0], gain: 1.8, edge: 0.2 },
  shades: { tint: SILVER, accent: [0.3, 0.45, 1.0], vivid: [0.9, 0.92, 1.0], vividAccent: [0.2, 0.45, 0.6], gain: 1.8, edge: 0.15 },
};

const MAKERS: Record<ItemId, (m: Maker) => void> = {
  crown, tiara, garland, turban, tophat: topHat, beanie, santa: santaHat, captain: captainCap,
  studs, hoops, jhumkas, nath, tikka, bindi, pearls,
  glasses: roundGlasses, shades: sunglasses,
};

/**
 * How thick each item's cloud is made, as a multiple of the counts its shapes ask for: the hats
 * are big shells and need many motes to read as solid; the jewellery is small and sparkles.
 */
const DENSE: Partial<Record<ItemId, number>> = {
  tophat: 2.4, beanie: 2.2, santa: 2.2, captain: 2.2, turban: 2.2, crown: 2, garland: 1.6, tiara: 1.6,
  glasses: 1.4, shades: 1.4, pearls: 1.4, nath: 1.5, tikka: 1.6, jhumkas: 1.4, hoops: 1.4, studs: 1.4, bindi: 1.4,
};

/**
 * The skin a hat covers, for the shader: the band's plane as (nx, ny, d) with the skin above
 * n·(x, y) = d, and how much it is dimmed. Null for nothing on the head, or something that
 * covers nothing (a tiara, a garland).
 */
export function coverOf(head: HeadwearId | null): readonly [number, number, number, number] | null {
  const b = head && head in BANDS ? BANDS[head as keyof typeof BANDS] : null;
  if (!b || !b.cover) return null;
  const nx = -Math.sin(b.lean);
  const ny = Math.cos(b.lean);
  // The band's middle is at (-1, height): the plane through it.
  return [nx, ny, nx * -1 + ny * b.height, b.cover];
}

/** How dark sunglasses make the eyes behind them (0 not at all .. 1 unseen). */
export const SHADE = 0.8;

/** Make one decoration's particles. The same every time: each has its own seed. */
export function makeItem(id: ItemId): Part<ItemId> {
  const seed = 1 + Object.keys(MAKERS).indexOf(id);
  const m = new Maker(id, 7001 + seed * 131, DENSE[id] ?? 1);
  MAKERS[id](m);
  return m.finish();
}
