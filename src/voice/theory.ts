// What a tube should do, worked out in the frequency domain: the check on tube.ts and the
// yardstick the vowels are fitted with. Not used while rendering.
//
// A slice of tube turns the pressure P and flow U at its lip end into those at its fold end:
//   P' = cos(kl)·P + i·Z·sin(kl)·U        U' = i·sin(kl)/Z·P + cos(kl)·U
// with Z = ρc/area, k = ω/c, l the slice's length (the transmission-line picture of Fant 1960).
// Start at the lips with the air outside as the load, walk back to the folds, and the flow you
// arrive with is what the folds must supply per unit of flow at the lips: small where the tube
// resonates.
import { DENSITY, IMPEDANCE, SOUND } from "./air.ts";
import { SECTIONS } from "./tube.ts";

// The same wall as tube.ts.
const WALL_MASS = 2.1;
const WALL_DRAG = 1000;
const WALL_SPRING = 84500;

/**
 * Resonances of a tube shut at the folds, in Hz, lowest first: the formants.
 *
 * Losses barely move a resonance, so they are left out here; then P is purely imaginary and U
 * purely real all the way down, and a resonance is simply where U at the folds changes sign.
 * What does move the resonances is kept: the mass of air outside the lips, and the mass and
 * spring of the walls (placed at the even junctions, as in tube.ts).
 */
export function resonances(area: ArrayLike<number>, length: number, count: number, upTo = 6000): number[] {
  const found: number[] = [];
  const step = 10;
  // Start above the walls' own slow resonance (about 30 Hz), which is not a formant.
  let before = foldFlow(area, length, 100);
  for (let hz = 100 + step; hz <= upTo && found.length < count; hz += step) {
    const now = foldFlow(area, length, hz);
    if (before * now < 0) {
      let lo = hz - step;
      let hi = hz;
      let atLo = before;
      for (let i = 0; i < 30; i++) {
        const mid = 0.5 * (lo + hi);
        const atMid = foldFlow(area, length, mid);
        if (atLo * atMid <= 0) hi = mid;
        else {
          lo = mid;
          atLo = atMid;
        }
      }
      found.push(0.5 * (lo + hi));
    }
    before = now;
  }
  return found;
}

/** Flow at the folds per unit flow at the lips, for the lossless tube. */
function foldFlow(area: ArrayLike<number>, length: number, hz: number): number {
  const slice = length / SECTIONS;
  const w = 2 * Math.PI * hz;
  const cs = Math.cos((w * slice) / SOUND);
  const sn = Math.sin((w * slice) / SOUND);
  const lip = area[SECTIONS - 1];
  let p = (w * 8 * DENSITY) / (3 * Math.PI * Math.sqrt(Math.PI * lip));
  let u = 1;
  for (let j = SECTIONS - 1; j >= 0; j--) {
    const z = IMPEDANCE / area[j];
    const p1 = cs * p + z * sn * u;
    u = (-sn / z) * p + cs * u;
    p = p1;
    if (j > 0 && (j & 1) === 0) {
      const surface = 2 * Math.sqrt(Math.PI * 0.5 * (area[j - 1] + area[j])) * 2 * slice;
      u += (surface / (w * WALL_MASS - WALL_SPRING / w)) * p;
    }
  }
  return u;
}

/**
 * How much flow leaves the lips per unit of flow from the folds at one frequency, with the
 * losses in: the height of the transfer function. `friction` is the loss number tube.ts uses
 * per odd junction for a slice of radius 1 cm.
 */
export function transfer(area: ArrayLike<number>, length: number, hz: number, friction: number): number {
  const slice = length / SECTIONS;
  const w = 2 * Math.PI * hz;
  const cs = Math.cos((w * slice) / SOUND);
  const sn = Math.sin((w * slice) / SOUND);
  const lip = area[SECTIONS - 1];
  // Radiation: resistance and mass in parallel.
  const r = (128 * IMPEDANCE) / (9 * Math.PI * Math.PI * lip);
  const x = (w * 8 * DENSITY) / (3 * Math.PI * Math.sqrt(Math.PI * lip));
  const d = r * r + x * x;
  let pr = (r * x * x) / d;
  let pi = (r * r * x) / d;
  let ur = 1;
  let ui = 0;
  for (let j = SECTIONS - 1; j >= 0; j--) {
    const z = IMPEDANCE / area[j];
    const npr = cs * pr - z * sn * ui;
    const npi = cs * pi + z * sn * ur;
    const nur = cs * ur - (sn / z) * pi;
    const nui = cs * ui + (sn / z) * pr;
    pr = npr;
    pi = npi;
    ur = nur;
    ui = nui;
    if (j === 0) break;
    if (j & 1) {
      // Friction: a series resistance on the fold side of the junction.
      const radius = Math.sqrt(Math.min(area[j - 1], area[j]) / Math.PI);
      const res = (Math.min(0.5, friction / radius) * IMPEDANCE) / area[j - 1];
      pr += res * ur;
      pi += res * ui;
    } else {
      // The wall: a shunt of mass, damper and spring in series.
      const surface = 2 * Math.sqrt(Math.PI * 0.5 * (area[j - 1] + area[j])) * 2 * slice;
      const react = w * WALL_MASS - WALL_SPRING / w;
      const dd = (WALL_DRAG * WALL_DRAG + react * react) / surface;
      const yr = WALL_DRAG / dd;
      const yi = -react / dd;
      ur += yr * pr - yi * pi;
      ui += yr * pi + yi * pr;
    }
  }
  return 1 / Math.sqrt(ur * ur + ui * ui);
}
