// Glasses: a frame in front of the eyes, a bridge over the nose and arms back to the ears. The
// lenses stand about 12 mm in front of the cornea, as a pair of spectacles does.
import { EYE } from "../head.ts";
import { mirror, pushOut } from "./fit.ts";
import { add, circle, cross, lerp, scale, smoothPath, surface, tube, unit, type Maker, type Vec } from "./shapes.ts";

const TAU = Math.PI * 2;
/** Where the lens plane stands, and how far each lens is turned so its outer edge sits back. */
const LENS_X = 8.75;
const WRAP = 0.16;

/** A lens's frame of directions on the right (side 1) or left (-1): across (toward the ear), up, and out (forward). */
function lensFrame(side: number) {
  const c: Vec = [LENS_X, EYE.y + 0.05, side * EYE.z];
  const out: Vec = [Math.cos(WRAP), 0, side * Math.sin(WRAP)];
  const up: Vec = [0, 1, 0];
  const across = unit(cross(up, out));
  // across points toward the ear on the right, toward the nose on the left: make it the ear on both.
  return { c, out, up, across: side > 0 ? scale(across, -1) : across };
}

/** An arm from the hinge back along the side of the head, over the ear, and down behind it. */
function arm(m: Maker, hinge: Vec, side: number, r: number): void {
  const right: Vec[] = [side > 0 ? hinge : mirror(hinge), [6.8, 7.25, 6.35], [3.6, 7.6, 7.25], [0.4, 8.0, 7.55], [-1.6, 8.25, 7.5], [-2.9, 7.1, 7.15], [-3.3, 5.9, 6.8]];
  const line = smoothPath(side > 0 ? right : right.map(mirror), 6).map((p) => pushOut(p, 0.2));
  tube(m, line, r, 520, { crease: 9, size: 0.55 });
}

/** A bridge rests on the nose, never in it. */
const onNose = (line: Vec[]) => line.map((p) => pushOut(p, 0.2));

/** Round glasses: thin round rims, a keyhole bridge, and clear lenses that catch one streak of light. */
export function roundGlasses(m: Maker): void {
  const R = 1.5;
  const hinges: Vec[] = [];
  for (const side of [1, -1]) {
    const f = lensFrame(side);
    const rim = circle(f.c, f.across, f.up, R, 64);
    tube(m, rim, 0.09, 900, { crease: 12, size: 0.6 });
    // The lens: clear glass, seen as a faint sheen and a bright diagonal streak.
    surface(m, (u, v) => add(add(f.c, f.across, R * 0.96 * Math.sqrt(v) * Math.cos(u * TAU)), f.up, R * 0.96 * Math.sqrt(v) * Math.sin(u * TAU)), 260, (u, v) => {
      const x = Math.sqrt(v) * Math.cos(u * TAU);
      const y = Math.sqrt(v) * Math.sin(u * TAU);
      const streak = Math.abs(x + y - 0.35) < 0.12 ? 1 : 0;
      return { accent: 1, glint: streak ? 1 : 0.2, size: 0.55, crease: streak ? 5 : 0 };
    }, (u, v) => {
      const x = Math.sqrt(v) * Math.cos(u * TAU);
      const y = Math.sqrt(v) * Math.sin(u * TAU);
      return Math.abs(x + y - 0.35) < 0.12 ? 1 : 0.3;
    });
    hinges.push(add(add(f.c, f.across, R * 0.98), f.up, 0.32));
  }
  // The bridge: up from each rim's inner edge and over the nose.
  const inner = (side: number) => {
    const f = lensFrame(side);
    return add(add(f.c, f.across, -R * 0.97), f.up, 0.35);
  };
  tube(m, onNose(smoothPath([inner(1), [LENS_X + 0.5, EYE.y + 0.95, 0.6], [LENS_X + 0.62, EYE.y + 1.05, 0], [LENS_X + 0.5, EYE.y + 0.95, -0.6], inner(-1)], 8)), 0.08, 260, { crease: 11, size: 0.55 });
  arm(m, hinges[0], 1, 0.07);
  arm(m, hinges[1], -1, 0.07);
}

/** Sunglasses: aviators, teardrop lenses filled with a dark mirror sheen, a double bridge, a fine metal frame. */
export function sunglasses(m: Maker): void {
  // The teardrop: wide at the top, falling to a deep curve on the side of the nose.
  const shape = (t: number): [number, number] => {
    const x = Math.cos(t);
    const y = Math.sin(t);
    const down = y < 0 ? -y : 0;
    return [1.85 * x + 0.25 * down * (0.4 - x), 1.25 * y - 0.75 * down * (0.6 + 0.4 * -x) + 0.15];
  };
  const hinges: Vec[] = [];
  const tops: Vec[] = [];
  const inners: Vec[] = [];
  for (const side of [1, -1]) {
    const f = lensFrame(side);
    const point = (t: number, k = 1): Vec => {
      const [x, y] = shape(t);
      return add(add(f.c, f.across, x * k), f.up, y * k);
    };
    const rim = Array.from({ length: 73 }, (_, i) => point((i / 72) * TAU));
    tube(m, rim, 0.06, 800, { crease: 12, glint: 0.5, size: 0.55 });
    // The lens: a dark mirror, all of it faintly lit, with two bright reflections across it.
    surface(m, (u, v) => lerp(add(f.c, f.up, 0.1), point(u * TAU), Math.sqrt(v)), 2600, (u, v) => {
      const [x, y] = shape(u * TAU).map((c) => c * Math.sqrt(v));
      const glare = Math.abs(x * 0.6 + y - 0.55) < 0.14 || Math.abs(x * 0.6 + y + 0.25) < 0.07 ? 1 : 0;
      return { accent: 1, glint: glare ? 1 : 0.15, crease: glare ? 6 : 0, size: 0.6 };
    });
    hinges.push(point(0.18));
    tops.push(point(Math.PI * 0.55));
    inners.push(point(Math.PI * 0.93));
  }
  // The double bridge: a straight bar across the top, and an arch lower down over the nose.
  tube(m, onNose(smoothPath([tops[0], [LENS_X + 0.45, EYE.y + 1.35, 0], tops[1]], 6)), 0.06, 220, { crease: 11, glint: 0.5, size: 0.55 });
  tube(m, onNose(smoothPath([inners[0], [LENS_X + 0.6, EYE.y + 0.95, 0], inners[1]], 6)), 0.06, 200, { crease: 11, glint: 0.5, size: 0.55 });
  arm(m, hinges[0], 1, 0.06);
  arm(m, hinges[1], -1, 0.06);
}
