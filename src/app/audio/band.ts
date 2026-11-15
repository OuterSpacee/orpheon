// The band beside the voices: up to eight instruments, each with a level and a place from left
// to right, and one level for the band as a whole. It adds itself into the voices' mix, in the
// AudioWorklet (live) and in the render worker (export), so both sound the same. render() and
// report() allocate nothing. It is handed the function that makes an instrument, so it can be
// tested with stand-ins.
import { INSTRUMENT_TELEMETRY_SIZE } from "../../contract.ts";
import type { BandNote, Instrument, InstrumentId } from "../../contract.ts";
import { BAND_SLOTS, SLOT, instrumentAt, slotAt } from "./packet.ts";

interface Slot {
  instrument: Instrument | null;
  left: number;
  right: number;
  goalLeft: number;
  goalRight: number;
  leaving: boolean;
  peak: number;
}

export class Band {
  /** Loudest sample the band added since the last report. */
  peak = 0;
  /** Samples an instrument produced that were not numbers (replaced by silence). */
  faults = 0;
  private readonly slots: Slot[] = [];
  private scratch = new Float32Array(128);
  private readonly sensed = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
  private readonly ease: number;
  private gain = 0.8;
  private goalGain = 0.8;
  private readonly make: (id: InstrumentId, sampleRate: number) => Instrument;

  constructor(
    readonly sampleRate: number,
    make: (id: InstrumentId, sampleRate: number) => Instrument,
  ) {
    this.make = make;
    // The same 15 ms glide as the voices: no change of level clicks.
    this.ease = 1 - Math.exp(-1 / (0.015 * sampleRate));
    for (let i = 0; i < BAND_SLOTS; i++) this.slots.push({ instrument: null, left: 0, right: 0, goalLeft: 0, goalRight: 0, leaving: false, peak: 0 });
  }

  add(slot: number, id: InstrumentId, level = 1, place = 0): void {
    const s = this.slots[slot];
    if (!s) return;
    s.instrument = this.make(id, this.sampleRate);
    s.left = s.right = 0;
    s.leaving = false;
    this.mix(slot, level, place);
  }

  remove(slot: number): void {
    const s = this.slots[slot];
    if (!s?.instrument) return;
    s.instrument.hush();
    s.leaving = true;
    s.goalLeft = s.goalRight = 0;
  }

  /** Equal power, as for the voices. */
  mix(slot: number, level: number, place: number): void {
    const s = this.slots[slot];
    if (!s?.instrument || s.leaving) return;
    const angle = ((Math.min(1, Math.max(-1, place)) + 1) * Math.PI) / 4;
    s.goalLeft = level * Math.cos(angle);
    s.goalRight = level * Math.sin(angle);
  }

  /** The whole band's level, 0..1; `now` skips the glide (for a render that starts with it). */
  level(level: number, now = false): void {
    this.goalGain = Math.min(1, Math.max(0, level));
    if (now) this.gain = this.goalGain;
  }

  /** Play notes `delay` seconds from now on the instrument's own clock: the same sample a voice given the same delay starts on. */
  perform(slot: number, notes: BandNote[], delay = 0): void {
    const instrument = this.slots[slot]?.instrument;
    if (!instrument) return;
    instrument.perform(notes, instrument.time + Math.max(0, delay));
  }

  strike(slot: number, midi: number, velocity: number): void {
    this.slots[slot]?.instrument?.strike(midi, velocity);
  }

  hush(slot: number): void {
    this.slots[slot]?.instrument?.hush();
  }

  has(slot: number): boolean {
    return !!this.slots[slot]?.instrument;
  }

  /** Add the next left.length samples of the band into the mix. */
  render(left: Float32Array, right: Float32Array): void {
    const n = left.length;
    if (this.scratch.length !== n) this.scratch = new Float32Array(n);
    const mono = this.scratch;
    const ease = this.ease;
    const startGain = this.gain;
    let peak = this.peak;
    for (let k = 0; k < BAND_SLOTS; k++) {
      const s = this.slots[k];
      if (!s.instrument) continue;
      s.instrument.render(mono);
      let gl = s.left;
      let gr = s.right;
      let g = startGain;
      let own = s.peak;
      for (let i = 0; i < n; i++) {
        let x = mono[i];
        if (!(x > -4 && x < 4)) {
          x = 0;
          this.faults++;
        }
        gl += (s.goalLeft - gl) * ease;
        gr += (s.goalRight - gr) * ease;
        g += (this.goalGain - g) * ease;
        const l = x * gl * g;
        const r = x * gr * g;
        left[i] += l;
        right[i] += r;
        const a = x < 0 ? -x : x;
        if (a > own) own = a;
        const lr = (l < 0 ? -l : l) + (r < 0 ? -r : r);
        if (lr > peak) peak = lr;
      }
      s.left = gl;
      s.right = gr;
      s.peak = own;
      if (s.leaving && gl < 1e-4 && gr < 1e-4) {
        s.instrument = null;
        s.leaving = false;
      }
    }
    // The band's own level glides the same way whether or not anything is seated.
    let g = startGain;
    for (let i = 0; i < n; i++) g += (this.goalGain - g) * ease;
    this.gain = g;
    this.peak = peak;
  }

  /** Write each slot's state into the packet. */
  report(packet: Float32Array): void {
    for (let k = 0; k < BAND_SLOTS; k++) {
      const s = this.slots[k];
      const at = slotAt(k);
      if (!s.instrument) {
        packet[at + SLOT.alive] = 0;
        packet[instrumentAt(k)] = 0;
        continue;
      }
      packet[at + SLOT.alive] = 1;
      packet[at + SLOT.peak] = s.peak;
      s.peak = 0;
      this.sensed.fill(0);
      s.instrument.sense(this.sensed);
      packet.set(this.sensed, instrumentAt(k));
    }
    this.peak = 0;
  }
}
