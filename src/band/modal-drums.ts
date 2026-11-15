// Drums as modal instruments: a stroke is a few partials, each a decaying phasor (see modal.ts).
// A struck head ignores the note's end: it rings, and falls away when its ring is up.
//
//   timpani  a kettle's head loaded with air, its modes near 1 : 1.5 : 2 : 2.44 : 2.9 of the note
//            (Fletcher & Rossing 1998, §18.4), and a low thump an octave under.
//   tabla    the dayan's loaded head rings in harmonics (Raman 1934): open ("tin") on its pitch, at
//            the rim ("na") on the second and third, closed ("ti") a dry tick. The bayan booms
//            ("ge") or is slapped flat ("ka").
import { hz, ModalPlayer, Voice } from "./modal.ts";

/** Partials as (ratio to the note, weight, seconds to fall by e). */
type Row = [number, number, number][];

abstract class ModalDrums extends ModalPlayer {
  protected readonly family = 5;
  protected add(v: Voice, f: number, row: Row, gain: number, velocity: number): void {
    row.forEach(([ratio, weight, tau], i) => v.mode(f * ratio, velocity * gain * weight, tau, i));
  }

  /** The drum struck last: its partials' strengths and ratios to the lowest; then how loud each drum is. */
  protected shape(into: Float32Array): void {
    const v = this.voices[this.recent];
    if (v.fmin < Infinity) {
      let peak = 1e-12;
      for (let m = 0; m < v.n; m++) if (v.active && v.id[m] < 16 && v.mag[m] > peak) peak = v.mag[m];
      for (let m = 0; m < v.n; m++) if (v.active && v.id[m] < 16) into[8 + v.id[m]] = v.mag[m] / peak;
      for (let i = 0; i < 16; i++) into[33 + i] = v.byId[i] / v.fmin;
    }
    for (const w of this.voices) if (w.active && w.drum < 8) into[24 + w.drum] = Math.min(1, into[24 + w.drum] + w.level() * w.velocity);
    into[32] = v.drum;
  }
}

/** Two kettle drums, each tuned to whatever pitch a stroke asks for. */
export class Timpani extends ModalDrums {
  private pitch = new Float64Array(2);
  private last = new Float64Array(2);
  private static readonly ROW: Row = [[1, 1, 0.55], [1.5, 0.55, 0.4], [1.99, 0.3, 0.3], [2.44, 0.18, 0.22], [2.89, 0.1, 0.16], [0.5, 0.25, 0.08]];

  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 6);
  }

  protected recipe(v: Voice, midi: number, velocity: number): void {
    // the drum already tuned to this pitch, else the one struck longer ago
    const k = this.pitch[0] === midi ? 0 : this.pitch[1] === midi ? 1 : this.last[0] <= this.last[1] ? 0 : 1;
    this.pitch[k] = midi;
    this.last[k] = this.now;
    v.drum = k;
    this.add(v, hz(midi), Timpani.ROW, 0.16, velocity);
    v.envelope(0.003, 0.04, 0, 1.6);
  }
}

const DAYAN = hz(60);
const BAYAN = hz(41);
/** the strokes by note number: 0 ge, 1 na, 2 tin, 3 ka, 4 ti */
const STROKES: Row[] = [
  [[1, 1, 0.3], [1.06, 0.5, 0.18], [2, 0.3, 0.14], [2.9, 0.12, 0.08]],
  [[1, 0.25, 0.2], [2, 1, 0.28], [3, 0.7, 0.22], [4, 0.3, 0.14], [5, 0.2, 0.1]],
  [[1, 1, 0.45], [2, 0.55, 0.3], [3, 0.3, 0.2], [4, 0.15, 0.12]],
  [[1.6, 0.8, 0.035], [3.1, 0.6, 0.03], [5.3, 0.4, 0.02]],
  [[1.1, 0.6, 0.03], [2.3, 0.8, 0.025], [3.7, 0.6, 0.02], [5.2, 0.4, 0.015]],
];

/** The bayan (drum 0) and the dayan (drum 1). */
export class Tabla extends ModalDrums {
  constructor(sampleRate: number) {
    super(sampleRate, 0.05, 16);
  }

  protected recipe(v: Voice, midi: number, velocity: number): void {
    const stroke = Math.max(0, Math.min(4, Math.round(midi)));
    const bayan = stroke === 0 || stroke === 3;
    v.drum = bayan ? 0 : 1;
    this.add(v, bayan ? BAYAN : DAYAN, STROKES[stroke], 0.2, velocity);
    v.envelope(0.002, 0.04, 0, 1.4);
  }
}
