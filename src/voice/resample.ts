// From the simulation's own rate to the device's.
//
// The tube runs at a rate set by the singer's size (about 45 to 75 kHz) that drifts a little as
// the larynx and lips move. The device wants a fixed rate anywhere from 8 to 192 kHz. Each
// output sample is read out of the recent simulation samples through a windowed sinc (the
// band-limited interpolation of Smith & Gosset 1984), with its cutoff under half the lower of
// the two rates so nothing folds over.

/** Lobes of the sinc on each side. */
const LOBES = 8;
/** Table entries per lobe. */
const FINE = 128;
const RING = 512;

export class Resampler {
  private ring = new Float64Array(RING);
  private kernel = new Float64Array(LOBES * FINE + 2);
  /** Simulation samples written so far. */
  count = 0;

  constructor() {
    for (let i = 0; i <= LOBES * FINE; i++) {
      const u = i / FINE;
      const sinc = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
      // A Blackman window: side lobes about 58 dB down.
      const w = 0.42 + 0.5 * Math.cos((Math.PI * u) / LOBES) + 0.08 * Math.cos((2 * Math.PI * u) / LOBES);
      this.kernel[i] = sinc * w;
    }
  }

  clear(): void {
    this.ring.fill(0);
  }

  push(sample: number): void {
    this.ring[this.count++ & (RING - 1)] = sample;
  }

  /**
   * How many simulation samples the kernel reaches each way when one lobe is `stretch` samples
   * wide.
   */
  reach(stretch: number): number {
    return LOBES * stretch;
  }

  /** How wide a lobe must be, in simulation samples, to keep the output clean at `deviceRate`. */
  stretchFor(simRate: number, deviceRate: number): number {
    const stretch = simRate / (0.9 * (deviceRate < simRate ? deviceRate : simRate));
    // The ring holds RING samples; never reach past it.
    const most = (RING / 2 - 2) / LOBES;
    return stretch > most ? most : stretch;
  }

  /** The signal at simulation-sample position `at` (fractional, counted like `count`). */
  read(at: number, stretch: number): number {
    const { ring, kernel } = this;
    const span = LOBES * stretch;
    const first = Math.ceil(at - span);
    const last = Math.floor(at + span);
    const perSample = FINE / stretch;
    let sum = 0;
    for (let n = first; n <= last; n++) {
      let u = (n - at) * perSample;
      if (u < 0) u = -u;
      const i = u | 0;
      const k = kernel[i] + (kernel[i + 1] - kernel[i]) * (u - i);
      sum += k * ring[n & (RING - 1)];
    }
    return sum / stretch;
  }
}
