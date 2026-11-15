// Where each instrument plays, as MIDI notes: what the arranger writes inside, and what the
// models are built to sound. Drums are not pitched: the kit takes General MIDI percussion
// numbers, the tabla its strokes (see index.ts).
import type { InstrumentId } from "../contract.ts";

export const PLAYABLE: Record<InstrumentId, [number, number]> = {
  /** a double bass, E1 to G3 (pizzicato rarely goes higher) */
  bass: [28, 55],
  /** a section from the cello's C2 to the violin's C7 */
  strings: [36, 96],
  /** a concert harp, C1 to G7 */
  harp: [24, 103],
  /** a steel-string guitar in standard tuning, E2 to D6 */
  guitar: [40, 86],
  /** a piano, A0 to C8 */
  piano: [21, 108],
  /** a concert flute, C4 to C7 */
  flute: [60, 96],
  /** a set of timpani, D2 to A3 */
  timpani: [38, 57],
  /** General MIDI percussion, acoustic bass drum to ride bell and on to the cowbell's neighbours */
  kit: [35, 59],
  /** the tanpura's strings, C2 to C4 */
  tanpura: [36, 60],
  /** the tabla's strokes: 0 ge, 1 na, 2 tin, 3 ka, 4 ti */
  tabla: [0, 4],
  /** a sarod, C2 to C6 */
  sarod: [36, 84],
  /** an esraj, G2 to C6 */
  esraj: [43, 84],
};

/** The pitch of pitch class `pc` inside [lo, hi] closest to `near`. */
export function pitchNear(pc: number, near: number, lo: number, hi: number): number {
  let best = -1;
  for (let p = lo; p <= hi; p++) if (((p % 12) + 12) % 12 === ((pc % 12) + 12) % 12 && (best < 0 || Math.abs(p - near) < Math.abs(best - near))) best = p;
  return best < 0 ? Math.max(lo, Math.min(hi, near)) : best;
}
