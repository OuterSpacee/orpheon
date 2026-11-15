// The piano: a felt hammer thrown at two or three strings tuned a hair apart.
//
// Chaigne & Askenfelt (1994, "Numerical simulations of piano strings", parts I and II) model the
// hammer as a mass on a felt spring that stiffens as it is squeezed, F = K·δ^p (p from about 2.3
// in the bass to 3 in the treble), thrown at strings that push back. Here, more simply, each
// string is a waveguide loop and the hammer meets it at one
// point: the strings there look like a resistance (the waves the force sends off both ways), and
// the wave the force sends toward the near end comes back inverted a moment later and throws the
// hammer off (after Van Duyne & Smith, "Commuted piano synthesis", 1995, where the same contact
// is solved against a waveguide). A louder blow squeezes the felt harder, so the contact is
// shorter and the tone brighter: the felt's nonlinearity is what makes a forte bright.
//
// Steel piano strings are stiff, so their overtones run sharp; two first-order allpasses in each
// loop stretch them (after Van Duyne & Smith 1994, "A simplified approach to modeling dispersion
// caused by stiffness in strings and plates"). The two or three strings of a note are tuned a
// cent or so apart, so they drift in and out of phase: the beating and the two-stage decay of a
// held note (Weinreich 1977, "Coupled piano strings"). Dampers fall on release, except at the top
// where pianos have none.
import { allpassFor, choose, CONTROL, hz, lowpassDelay, lowpassGain, Player, Resonator, stringShape, DcBlock, writeNotes } from "./core.ts";

const STRINGS = 3;
const DETUNE = [0, 0.8, -0.9];
const LOWEST = 21;
/** Where the hammer strikes, as a fraction of the length from the near end. */
const STRIKE = 1 / 8;
/** The highest note with a damper. */
const TOP_DAMPER = 89;

class Note {
  bufs: Float32Array[];
  size: number;
  w = 0;
  n = new Int32Array(STRINGS);
  p = 0;
  y1 = new Float64Array(STRINGS);
  /** dispersion allpasses (two per string) and the tuning allpass */
  ad = 0;
  d1x = new Float64Array(STRINGS);
  d1y = new Float64Array(STRINGS);
  d2x = new Float64Array(STRINGS);
  d2y = new Float64Array(STRINGS);
  c = new Float64Array(STRINGS);
  tx = new Float64Array(STRINGS);
  ty = new Float64Array(STRINGS);
  g = new Float64Array(STRINGS);
  gTarget = new Float64Array(STRINGS);
  strings = 3;
  busy = false;
  midi = -1;
  released = false;
  energy = 0;
  age = 0;
  // the hammer
  hammer = false;
  xh = 0;
  vh = 0;
  ys = 0;
  mass = 0.008;
  stiff = 1e9;
  power = 2.5;
  impedance = 4;
  /** what the force sent toward the near end, waiting to come back */
  hist: Float32Array;
  hw = 0;
  dh = 1;
  tail = 0;
  fade = 0;
  fadeStep = 0;
  gain = 1;
  pendingMidi = -1;
  pendingVelocity = 0;
  constructor(size: number) {
    this.size = size;
    this.bufs = Array.from({ length: STRINGS }, () => new Float32Array(size));
    this.hist = new Float32Array(Math.ceil(size * STRIKE) + 4);
  }
}

export class Piano extends Player {
  protected readonly family = 3;
  private notes: Note[];
  private busy: boolean[];
  private loud: Float64Array;
  private rate: number;
  private substeps: number;
  private energyK: number;
  private board: Resonator[];
  private dc: DcBlock;
  private midis: Float64Array;
  private energies: Float64Array;

  constructor(sampleRate: number, voices = 10) {
    super(sampleRate, 0.1);
    this.rate = sampleRate;
    const size = Math.ceil(sampleRate / hz(LOWEST - 1)) + 8;
    this.notes = Array.from({ length: voices }, () => new Note(size));
    this.busy = new Array(voices).fill(false);
    this.loud = new Float64Array(voices);
    this.midis = new Float64Array(voices);
    this.energies = new Float64Array(voices);
    // the hammer's contact is worked out at 96 kHz or finer, whatever the device rate
    this.substeps = Math.max(1, Math.ceil(96000 / sampleRate));
    this.energyK = 1 - Math.exp(-1 / (0.03 * sampleRate));
    // a soundboard's broad resonances
    this.board = [new Resonator(sampleRate, 110, 2, 0.3), new Resonator(sampleRate, 250, 2, 0.3), new Resonator(sampleRate, 620, 1.5, 0.2), new Resonator(sampleRate, 2100, 1, 0.12)];
    this.dc = new DcBlock(sampleRate);
  }

  protected start(midi: number, velocity: number): void {
    // the same key again: the hammer strikes the strings as they are
    for (let i = 0; i < this.notes.length; i++) {
      const v = this.notes[i];
      if (v.busy && v.midi === midi && v.pendingMidi < 0 && v.fade === 0) {
        this.throwHammer(v, velocity);
        for (let s = 0; s < v.strings; s++) v.gTarget[s] = this.undamped(midi, s);
        v.released = false;
        return;
      }
    }
    for (let i = 0; i < this.notes.length; i++) {
      this.busy[i] = this.notes[i].busy;
      this.loud[i] = this.notes[i].released ? this.notes[i].energy : this.notes[i].energy + 1;
    }
    const v = this.notes[choose(this.busy, this.loud)];
    if (v.busy && v.energy > 1e-8) {
      v.pendingMidi = midi;
      v.pendingVelocity = velocity;
      v.fade = Math.max(1, Math.round(0.004 * this.rate));
      v.fadeStep = v.gain / v.fade;
      return;
    }
    this.tune(v, midi);
    this.throwHammer(v, velocity);
  }

  /** Loop gain for a string left to ring: 60 dB in 20 s low down to 1.5 s at the top. */
  private undamped(midi: number, s: number): number {
    const f0 = hz(midi);
    const x = Math.max(0, Math.min(1, (midi - 33) / (96 - 33)));
    const ring = 20 * Math.pow(1.5 / 20, x) * (s === 1 ? 1.1 : s === 2 ? 0.9 : 1);
    return Math.min(0.99995, Math.pow(10, -3 / (f0 * ring)) / lowpassGain(0.2, (2 * Math.PI * f0) / this.rate));
  }

  private tune(v: Note, midi: number): void {
    v.midi = midi;
    const f0 = hz(midi);
    if (this.rate / f0 < 8) {
      v.busy = false;
      return;
    }
    // one string low down, two in the tenor, three above (as a piano is strung)
    v.strings = midi < 32 ? 1 : midi < 46 ? 2 : 3;
    const x = Math.max(0, Math.min(1, (midi - LOWEST) / (108 - LOWEST)));
    v.p = 0.2;
    // stiffer strings, stronger stretching, toward the top
    v.ad = -0.12 - 0.3 * x;
    // hammers: heavier and softer in the bass (Chaigne & Askenfelt's ranges, interpolated)
    v.mass = 0.011 - 0.005 * x;
    v.power = 2.3 + 0.7 * x;
    v.impedance = 6 - 4.5 * x;
    // felt stiffness for a contact of about 4 ms in the bass to 0.8 ms at the top, at mezzo forte
    const contact = 0.004 * Math.pow(0.2, x);
    v.stiff = v.mass * Math.pow((3.2 * Math.pow(2, -(v.power - 1) / (v.power + 1))) / contact, v.power + 1);
    for (let s = 0; s < v.strings; s++) {
      const f = f0 * Math.pow(2, DETUNE[s] / 1200);
      const w = (2 * Math.PI * f) / this.rate;
      const period = this.rate / f;
      const disp = 2 * dispersionDelay(v.ad, w);
      const lp = lowpassDelay(v.p, w);
      let n = Math.floor(period - lp - disp - 0.5);
      if (n > v.size - 2) n = v.size - 2;
      if (n < 2) n = 2;
      let frac = period - lp - disp - n;
      if (frac < 0.1) frac = 0.1;
      if (frac * w > 3) frac = 3 / w;
      v.n[s] = n;
      v.c[s] = allpassFor(frac, w);
      v.y1[s] = v.d1x[s] = v.d1y[s] = v.d2x[s] = v.d2y[s] = v.tx[s] = v.ty[s] = 0;
      v.bufs[s].fill(0);
      v.g[s] = v.gTarget[s] = this.undamped(midi, s);
    }
    v.dh = Math.max(1, Math.min(v.hist.length - 1, Math.round(STRIKE * v.n[0])));
    v.hist.fill(0);
    v.hw = 0;
    v.w = 0;
    v.released = false;
    v.busy = true;
    v.energy = 1e-6;
    v.age = 0;
  }

  /** Throw the hammer: up to about 5 m/s for a hard blow. */
  private throwHammer(v: Note, velocity: number): void {
    if (!v.busy) return;
    v.hammer = true;
    v.xh = 0;
    v.ys = 0;
    v.vh = 0.5 + 4.5 * velocity * velocity;
    v.tail = v.dh + 2;
  }

  protected stop(midi: number): void {
    if (midi >= TOP_DAMPER) return;
    for (const v of this.notes) {
      if (!v.busy || v.midi !== midi || v.released) continue;
      v.released = true;
      const f0 = hz(midi);
      // the damper stops the strings in about a quarter of a second; never above the undamped
      // string (a high note at a low sample rate passed 1 and grew until it went NaN)
      for (let s = 0; s < v.strings; s++) v.gTarget[s] = Math.min(this.undamped(midi, s), Math.pow(10, -3 / (f0 * 0.25)) / lowpassGain(v.p, (2 * Math.PI * f0) / this.rate));
    }
  }

  protected silence(): void {
    for (const v of this.notes) {
      v.busy = false;
      v.hammer = false;
      v.pendingMidi = -1;
      v.fade = 0;
      v.energy = 0;
    }
    for (const b of this.board) b.clear();
  }

  protected control(): void {
    for (const v of this.notes) {
      if (!v.busy) continue;
      v.age += CONTROL;
      for (let s = 0; s < v.strings; s++) v.g[s] += 0.3 * (v.gTarget[s] - v.g[s]);
      if (v.energy < 1e-11 && !v.hammer && v.tail <= 0 && v.age > 0.05 * this.rate && v.pendingMidi < 0) v.busy = false;
    }
  }

  protected play(out: Float32Array, from: number, count: number): void {
    for (const v of this.notes) {
      if (!v.busy) continue;
      let done = 0;
      while (done < count) {
        if (v.fade > 0) {
          const run = Math.min(count - done, v.fade);
          this.run(v, out, from + done, run, true);
          done += run;
          v.fade -= run;
          if (v.fade === 0) {
            v.gain = 1;
            const midi = v.pendingMidi;
            v.pendingMidi = -1;
            this.tune(v, midi);
            this.throwHammer(v, v.pendingVelocity);
            if (!v.busy) break;
          }
        } else {
          this.run(v, out, from + done, count - done, false);
          done = count;
        }
      }
    }
  }

  /** The hammer's force this sample, as the velocity it gives each string (worked out in substeps). */
  private contact(v: Note, back: number): number {
    const sub = this.substeps;
    const dt = 1 / (this.rate * sub);
    const r = v.impedance * 2 * v.strings;
    let u = 0;
    let sum = 0;
    for (let k = 0; k < sub; k++) {
      const squeeze = v.xh - v.ys;
      const force = squeeze > 0 ? v.stiff * Math.pow(squeeze, v.power) : 0;
      u = force / r;
      // the string under the hammer moves with what the force sends off, and what comes back
      v.ys += (u + back) * dt;
      v.vh -= (force / v.mass) * dt;
      v.xh += v.vh * dt;
      sum += u;
    }
    // the hammer has bounced off and is falling away
    if (v.xh < v.ys && v.vh < 0) v.hammer = false;
    return sum / sub;
  }

  private run(v: Note, out: Float32Array, from: number, count: number, fading: boolean): void {
    const size = v.size;
    const hist = v.hist;
    const hsize = hist.length;
    const k = this.energyK;
    const p = v.p;
    const ad = v.ad;
    let gain = v.gain;
    const step = fading ? v.fadeStep : 0;
    let energy = v.energy;
    // one sample at a time while the hammer is on the strings or its wave is still coming back
    let i = 0;
    while (i < count && (v.hammer || v.tail > 0)) {
      let back = v.hw - v.dh;
      if (back < 0) back += hsize;
      const returning = -hist[back];
      const u = v.hammer ? this.contact(v, returning) : 0;
      hist[v.hw] = u;
      if (++v.hw === hsize) v.hw = 0;
      if (!v.hammer) v.tail--;
      // into each string: the wave sent toward the bridge, and the one reflected from the near end
      const push = u + returning;
      let sum = 0;
      for (let s = 0; s < v.strings; s++) sum += this.stepString(v, s, push, p, ad);
      out[from + i] += sum * gain;
      energy += k * (sum * sum - energy);
      gain -= step;
      v.w = v.w + 1 === size ? 0 : v.w + 1;
      i++;
    }
    if (i < count) {
      // the strings alone: each loop in turn over the rest of the run
      const w0 = v.w;
      const len = count - i;
      for (let s = 0; s < v.strings; s++) {
        const buf = v.bufs[s];
        const g = v.g[s] * (1 - p);
        const c = v.c[s];
        let y1 = v.y1[s];
        let d1x = v.d1x[s];
        let d1y = v.d1y[s];
        let d2x = v.d2x[s];
        let d2y = v.d2y[s];
        let tx = v.tx[s];
        let ty = v.ty[s];
        let w = w0;
        let r = w0 - v.n[s];
        if (r < 0) r += size;
        let gg = gain;
        for (let j = 0; j < len; j++) {
          const x = buf[r];
          const lp = g * x + p * y1;
          y1 = lp;
          const a1 = ad * lp + d1x - ad * d1y;
          d1x = lp;
          d1y = a1;
          const a2 = ad * a1 + d2x - ad * d2y;
          d2x = a1;
          d2y = a2;
          const z = c * a2 + tx - c * ty;
          tx = a2;
          ty = z;
          buf[w] = z;
          out[from + i + j] += x * gg;
          gg -= step;
          if (++w === size) w = 0;
          if (++r === size) r = 0;
        }
        v.y1[s] = y1;
        v.d1x[s] = d1x;
        v.d1y[s] = d1y;
        v.d2x[s] = d2x;
        v.d2y[s] = d2y;
        v.tx[s] = tx;
        v.ty[s] = ty;
      }
      // the loudness from what was written (the sum of the strings over the run)
      let w = w0;
      for (let j = 0; j < len; j++) {
        let x = 0;
        for (let s = 0; s < v.strings; s++) {
          let r = w - v.n[s];
          if (r < 0) r += size;
          x += v.bufs[s][r];
        }
        energy += k * (x * x - energy);
        if (++w === size) w = 0;
      }
      v.w = w;
      gain -= step * len;
    }
    v.energy = energy;
    v.gain = gain < 0 ? 0 : gain;
  }

  /** One sample of one string, with something pushed in; returns what reached the bridge. */
  private stepString(v: Note, s: number, push: number, p: number, ad: number): number {
    const size = v.size;
    const buf = v.bufs[s];
    let r = v.w - v.n[s];
    if (r < 0) r += size;
    const x = buf[r];
    const lp = v.g[s] * (1 - p) * x + p * v.y1[s];
    v.y1[s] = lp;
    const a1 = ad * lp + v.d1x[s] - ad * v.d1y[s];
    v.d1x[s] = lp;
    v.d1y[s] = a1;
    const a2 = ad * a1 + v.d2x[s] - ad * v.d2y[s];
    v.d2x[s] = a1;
    v.d2y[s] = a2;
    const c = v.c[s];
    const z = c * a2 + v.tx[s] - c * v.ty[s];
    v.tx[s] = a2;
    v.ty[s] = z;
    buf[v.w] = z + push;
    return x;
  }

  protected finish(x: number): number {
    let y = 0.5 * x;
    for (const b of this.board) y += b.step(x);
    return this.dc.step(y) * 0.09;
  }

  protected sounding(): number {
    let n = 0;
    for (const v of this.notes) if (v.busy) n++;
    return n;
  }

  protected shape(into: Float32Array): void {
    let loudest: Note | null = null;
    for (const v of this.notes) if (v.busy && (!loudest || v.energy > loudest.energy)) loudest = v;
    if (loudest) {
      let r = loudest.w - loudest.n[0];
      if (r < 0) r += loudest.size;
      stringShape(loudest.bufs[0], r, loudest.n[0], loudest.size, into, 8);
    }
    for (let i = 0; i < this.notes.length; i++) {
      this.midis[i] = this.notes[i].busy ? this.notes[i].midi : -1;
      this.energies[i] = this.notes[i].energy;
    }
    writeNotes(into, this.midis, this.energies, 0.01);
  }
}

/** Phase delay of one first-order allpass (a + z^-1)/(1 + a z^-1) at w (a < 0 delays the lows more: stretched overtones). */
function dispersionDelay(a: number, w: number): number {
  return (2 * Math.atan(((1 - a) / (1 + a)) * Math.tan(w / 2))) / w;
}
