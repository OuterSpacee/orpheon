// Measuring rendered sound: nobody on this project can listen, so the tests and tools do it
// with these. Plain signal processing, no dependencies.

/** In-place radix-2 FFT. The length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** Power spectrum of `size` samples from `from` under a Hann window: size/2 bins of width rate/size. */
export function powerSpectrum(x: ArrayLike<number>, from: number, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  fft(re, im);
  const out = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) out[i] = re[i] * re[i] + im[i] * im[i];
  return out;
}

/** Power between two frequencies, averaged over frames from `from` to `to` (in samples). */
export function bandPower(x: ArrayLike<number>, rate: number, from: number, to: number, lo: number, hi: number): number {
  const size = 1024;
  let sum = 0;
  let frames = 0;
  for (let at = from; at + size <= to; at += size / 2) {
    const p = powerSpectrum(x, at, size);
    for (let i = Math.ceil((lo * size) / rate); i <= Math.floor((hi * size) / rate) && i < size / 2; i++) sum += p[i];
    frames++;
  }
  return frames ? sum / frames : 0;
}

/** Where the weight of the spectrum sits, in Hz, between `from` and `to` (samples), counting only lo..hi Hz. */
export function centroid(x: ArrayLike<number>, rate: number, from: number, to: number, lo = 300, hi = 12000): number {
  const size = 1024;
  let top = 0;
  let bottom = 0;
  for (let at = from; at + size <= to; at += size / 2) {
    const p = powerSpectrum(x, at, size);
    for (let i = Math.ceil((lo * size) / rate); i <= Math.floor((hi * size) / rate) && i < size / 2; i++) {
      top += p[i] * ((i * rate) / size);
      bottom += p[i];
    }
  }
  return bottom > 0 ? top / bottom : 0;
}

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function db(ratio: number): number {
  return 20 * Math.log10(Math.max(ratio, 1e-12));
}

/**
 * Pitch in Hz by autocorrelation between `lo` and `hi` Hz, or 0 if the stretch is not periodic
 * (peak of the normalised autocorrelation under `clear`).
 */
export function pitchOf(x: ArrayLike<number>, rate: number, from: number, to: number, lo = 50, hi = 1500, clear = 0.5): number {
  const n = to - from;
  const maxLag = Math.min(Math.floor(rate / lo), n >> 1);
  const minLag = Math.max(2, Math.floor(rate / hi));
  let energy = 0;
  for (let i = from; i < to; i++) energy += x[i] * x[i];
  if (energy <= 0) return 0;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = from; i + lag < to; i++) s += x[i] * x[i + lag];
    ac[lag] = (s / energy) * (n / (n - lag));
  }
  // Take the first clear peak, not the highest: the highest may be a multiple of the period.
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > best) best = ac[lag];
  if (best < clear) return 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (ac[lag] > 0.9 * best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      const a = ac[lag - 1];
      const b = ac[lag];
      const c = ac[lag + 1];
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      return rate / (lag + shift);
    }
  }
  return 0;
}

/** Keep every `factor`-th sample after a low-pass at the new Nyquist frequency. */
export function decimate(x: ArrayLike<number>, factor: number): Float64Array {
  if (factor === 1) return Float64Array.from(x);
  const half = 16 * factor;
  const taps = new Float64Array(2 * half + 1);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const u = (0.9 * i) / factor;
    const sinc = i === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
    taps[i + half] = sinc * (0.5 + 0.5 * Math.cos((Math.PI * i) / half));
    sum += taps[i + half];
  }
  const out = new Float64Array(Math.floor(x.length / factor));
  for (let o = 0; o < out.length; o++) {
    let s = 0;
    for (let i = -half; i <= half; i++) s += taps[i + half] * (x[o * factor + i] ?? 0);
    out[o] = s / sum;
  }
  return out;
}

/** Linear prediction by the autocorrelation method: A(z) = 1 + a[1]/z + … + a[order]/z^order. */
export function lpc(x: ArrayLike<number>, order: number): Float64Array {
  const r = new Float64Array(order + 1);
  for (let lag = 0; lag <= order; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    r[lag] = s;
  }
  r[0] *= 1 + 1e-9;
  const a = new Float64Array(order + 1);
  const tmp = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
    a[i] = k;
    err *= 1 - k * k;
  }
  return a;
}

/** Roots of a polynomial with real coefficients c[0]·z^n + … + c[n] (Durand and Kerner's method). */
export function roots(c: ArrayLike<number>): { re: number; im: number }[] {
  const n = c.length - 1;
  const zr = new Float64Array(n);
  const zi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    zr[i] = 0.9 * Math.cos(0.4 + (2 * Math.PI * i) / n);
    zi[i] = 0.9 * Math.sin(0.4 + (2 * Math.PI * i) / n);
  }
  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let pr = c[0];
      let pi = 0;
      for (let k = 1; k <= n; k++) {
        const t = pr * zr[i] - pi * zi[i] + c[k];
        pi = pr * zi[i] + pi * zr[i];
        pr = t;
      }
      let qr = c[0];
      let qi = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dr = zr[i] - zr[j];
        const di = zi[i] - zi[j];
        const t = qr * dr - qi * di;
        qi = qr * di + qi * dr;
        qr = t;
      }
      const den = qr * qr + qi * qi || 1e-300;
      const sr = (pr * qr + pi * qi) / den;
      const si = (pi * qr - pr * qi) / den;
      zr[i] -= sr;
      zi[i] -= si;
      moved += Math.abs(sr) + Math.abs(si);
    }
    if (moved < 1e-12) break;
  }
  return Array.from(zr, (re, i) => ({ re, im: zi[i] }));
}

export interface Formant {
  hz: number;
  /** Bandwidth in Hz. */
  wide: number;
}

/**
 * Resonances of the voice in a stretch of steady sound, lowest first, by linear prediction: the
 * standard formant measurement (Markel & Gray 1976). `ceiling` is the highest frequency looked
 * at: about 5000 Hz holds five formants of a man, 5500 of a woman, 6500 or more of a child.
 */
export function formantsOf(x: ArrayLike<number>, rate: number, from: number, to: number, ceiling = 5000, order = 0): Formant[] {
  const factor = Math.max(1, Math.round(rate / (2 * ceiling)));
  const low = decimate(Array.prototype.slice.call(x, from, to) as number[], factor);
  const lowRate = rate / factor;
  const n = low.length;
  const framed = new Float64Array(n);
  for (let i = 1; i < n; i++) framed[i] = (low[i] - 0.97 * low[i - 1]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const a = lpc(framed, order || 2 + Math.round(lowRate / 1000));
  const found: Formant[] = [];
  for (const z of roots(a)) {
    if (z.im <= 0) continue;
    const hz = (Math.atan2(z.im, z.re) * lowRate) / (2 * Math.PI);
    const wide = (-Math.log(Math.hypot(z.re, z.im)) * lowRate) / Math.PI;
    if (hz > 90 && hz < lowRate / 2 - 50 && wide < 700) found.push({ hz, wide });
  }
  return found.sort((p, q) => p.hz - q.hz);
}

/** A mono 16-bit WAV file. */
export function wav(x: ArrayLike<number>, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + 2 * x.length);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + 2 * x.length, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 2 * x.length, true);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    view.setInt16(44 + 2 * i, Math.round(v * 32767), true);
  }
  return bytes;
}
