// Seeded noise, so the same input always gives the same sound.

export class Noise {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0 || 0x2545f491;
  }

  /** White noise with mean 0 and variance 1 (xorshift32; Marsaglia 2003). */
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s;
    // s is a signed 32-bit integer; scale it to a uniform spread of unit variance.
    return s * 8.065491e-10;
  }

  reseed(seed: number): void {
    this.s = seed | 0 || 0x2545f491;
  }
}
