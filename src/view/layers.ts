// How each part of the body is drawn: its lean inside the cold family of the look, how much of a
// see-through shell it is, where it drifts to when the body is taken apart, and where the eye
// should rest to see it alone.
import type { LayerId } from "../contract.ts";

/**
 * How many particles are made, as a multiple of each part's count: more than are drawn at the
 * page's usual density, so "Density" can thicken the cloud as well as thin it.
 */
export const BUILT = 1.5;
/** The density the page starts at (a share of what is made): the cloud as it was before it could be thickened. */
export const DENSITY_USUAL = 1 / BUILT;

export interface Style {
  /** Its colour at rest. Tissue stays cold; only sound warms it. */
  tint: readonly [number, number, number];
  /** Its colour with "Colour" turned all the way up: each part its own hue, as an anatomy plate tells them apart. */
  vivid: readonly [number, number, number];
  /** 0 a soft glow all over .. 1 clear when seen face-on, bright at its edges. */
  edge: number;
  /** Brightness. */
  gain: number;
  /** Where it goes at full explode, in cm. */
  apart: readonly [number, number, number];
  /** The middle of it and its reach, for framing it alone. */
  middle: readonly [number, number, number];
  reach: number;
  /** How many particles it gets on a machine that can afford them all. */
  count: number;
}

export const STYLE: Record<LayerId, Style> = {
  skin: { tint: [0.79, 0.84, 1.0], vivid: [1.0, 0.6, 0.62], edge: 1, gain: 0.5, apart: [-33, 1, 0], middle: [-0.5, 2.5, 0], reach: 19, count: 95000 },
  bone: { tint: [0.9, 0.91, 0.96], vivid: [1.0, 0.9, 0.7], edge: 0.65, gain: 0.45, apart: [-14, 4, 0], middle: [-0.5, 3, 0], reach: 18, count: 70000 },
  tongue: { tint: [0.8, 0.71, 1.0], vivid: [1.0, 0.3, 0.5], edge: 0.75, gain: 0.8, apart: [2, -4.5, 0], middle: [4.3, -2, 0], reach: 6.5, count: 22000 },
  lips: { tint: [0.87, 0.76, 1.0], vivid: [1.0, 0.36, 0.34], edge: 0.7, gain: 0.55, apart: [7, -0.5, 0], middle: [8.8, 0, 0], reach: 4, count: 7000 },
  palate: { tint: [0.6, 0.88, 0.94], vivid: [0.95, 0.45, 0.85], edge: 0.6, gain: 0.75, apart: [2, 4.5, 0], middle: [4.5, 1.5, 0], reach: 6, count: 11000 },
  nose: { tint: [0.64, 0.82, 1.0], vivid: [0.3, 0.92, 0.82], edge: 0.7, gain: 0.6, apart: [4, 10.5, 0], middle: [5.2, 3.6, 0], reach: 6.5, count: 14000 },
  air: { tint: [0.79, 0.84, 1.0], vivid: [0.38, 0.78, 1.0], edge: 0.5, gain: 0.8, apart: [0, 0, 0], middle: [4, -1.5, 0], reach: 9.5, count: 52000 },
  larynx: { tint: [0.64, 0.93, 0.87], vivid: [0.42, 1.0, 0.55], edge: 0.7, gain: 0.7, apart: [-1, -8, 0], middle: [1.5, -11, 0], reach: 8.5, count: 18000 },
  lungs: { tint: [0.56, 0.72, 1.0], vivid: [0.58, 0.46, 1.0], edge: 0.85, gain: 0.6, apart: [19, 12, 0], middle: [0, -26, 0], reach: 17, count: 32000 },
  sound: { tint: [1.0, 0.9, 0.76], vivid: [1.0, 0.78, 0.4], edge: 0, gain: 0.55, apart: [15, 9, 0], middle: [14, 0, 0], reach: 14, count: 22000 },
};
