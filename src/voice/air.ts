// The air in a warm, wet airway. Everything in the engine is in CGS units: centimetres, grams,
// seconds; pressure in dyn/cm² (980.665 of them make 1 cm of water); flow in cm³/s.

/** Speed of sound in the airway, cm/s (humid air near body temperature; Flanagan 1972). */
export const SOUND = 35000;
/** Density of that air, g/cm³. */
export const DENSITY = 0.00114;
/** Its viscosity, dyn·s/cm². */
export const VISCOSITY = 1.86e-4;
/** DENSITY × SOUND: a tube of area A carries waves with impedance IMPEDANCE / A. */
export const IMPEDANCE = DENSITY * SOUND;

/** Pressure of one centimetre of water, the unit the voice literature measures breath in. */
export const CM_H2O = 980.665;

/**
 * Lung pressure in dyn/cm² for Pose.lungs. 0.4 gives about 4 cm H2O (quiet speech), 0.6 about
 * 8.5 (comfortable singing), 1 about 22 (a shout): the ranges of Sundberg, Titze & Scherer (1993).
 * A negative value is the suction of breathing in.
 */
export function lungPressure(lungs: number): number {
  const a = lungs < 0 ? -lungs : lungs;
  const p = 20000 * a * a + 2000 * a;
  return lungs < 0 ? -p : p;
}
