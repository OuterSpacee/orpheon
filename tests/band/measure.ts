// Measuring an instrument: render notes, find their pitch to a fraction of a cent, their decay,
// their harmonics, and any click.
import type { BandNote, InstrumentId } from "../../src/contract.ts";
import { createInstrument } from "../../src/band/index.ts";

export const RATE = 48000;
export const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const cents = (a: number, b: number): number => 1200 * Math.log2(a / b);

/** Render notes on a fresh instrument, in blocks of `block`. */
export function render(id: InstrumentId, notes: BandNote[], seconds: number, rate = RATE, block = 128): Float32Array {
  const ins = createInstrument(id, rate);
  ins.perform(notes, 0);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += block) ins.render(out.subarray(i, Math.min(out.length, i + block)));
  return out;
}

/** One note, from 50 ms in. */
export const note = (id: InstrumentId, midi: number, d: number, seconds: number, velocity = 0.8, rate = RATE): Float32Array =>
  render(id, [{ t: 0.05, d, midi, velocity }], seconds, rate);

/** The complex amplitude of frequency f over x[from, from+n) under a Hann window. */
function dft(x: ArrayLike<number>, rate: number, f: number, from: number, n: number): [number, number] {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * f) / rate;
  for (let i = 0; i < n; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const v = (x[from + i] ?? 0) * h;
    re += v * Math.cos(w * (from + i));
    im -= v * Math.sin(w * (from + i));
  }
  return [re, im];
}

/** How strong frequency f is over a stretch (magnitude of its windowed DFT, normalised by the window's length). */
export function strength(x: ArrayLike<number>, rate: number, f: number, from: number, n: number): number {
  const [re, im] = dft(x, rate, f, from, n);
  return (2 * Math.sqrt(re * re + im * im)) / (n / 2);
}

/**
 * The frequency near `guess` that is strongest from `from` to `to` (samples): a scan for the
 * peak, then the phase it gains between two windows (a phase vocoder's estimate), which is
 * accurate to far under a cent.
 */
export function frequencyNear(x: ArrayLike<number>, rate: number, guess: number, from: number, to: number): number {
  const n = Math.min(to - from, Math.round(rate * 0.25));
  let best = guess;
  let top = -1;
  for (let c = -60; c <= 60; c += 2) {
    const f = guess * Math.pow(2, c / 1200);
    const s = strength(x, rate, f, from, n);
    if (s > top) {
      top = s;
      best = f;
    }
  }
  // the phase gained between two windows, from close together (no ambiguity) to as far apart as
  // the stretch allows (vibrato averaged out), each step starting from the last one's estimate
  let estimate = best;
  for (const gap of [0.02, 0.1, 0.4, Infinity]) {
    const hop = Math.min(to - from - n, Math.round(rate * gap));
    if (hop < 16) break;
    const [a, b] = dft(x, rate, estimate, from, n);
    const [c, d] = dft(x, rate, estimate, from + hop, n);
    const turn = Math.atan2(b * c - a * d, a * c + b * d);
    estimate -= (turn * rate) / (2 * Math.PI * hop);
    if (hop === to - from - n) break;
  }
  return estimate;
}

/** Running rms in windows of 10 ms. */
export function envelope(x: Float32Array, rate: number): Float64Array {
  const w = Math.round(rate * 0.01);
  const out = new Float64Array(Math.floor(x.length / w));
  for (let k = 0; k < out.length; k++) {
    let s = 0;
    for (let i = k * w; i < (k + 1) * w; i++) s += x[i] * x[i];
    out[k] = Math.sqrt(s / w);
  }
  return out;
}

/**
 * Seconds to fall 60 dB, from the slope of the level in dB between 6 dB and 30 dB below the
 * loudest point (a straight-line fit, as reverberation times are measured), on the level
 * averaged over 50 ms so that beating strings do not throw it.
 */
export function t60(x: Float32Array, rate: number): number {
  const raw = envelope(x, rate);
  const env = raw.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) {
      s += raw[k] * raw[k];
      n++;
    }
    return Math.sqrt(s / n);
  });
  let peak = 0;
  let at = 0;
  env.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      at = i;
    }
  });
  const pts: [number, number][] = [];
  for (let i = at; i < env.length; i++) {
    const db = 20 * Math.log10(env[i] / peak + 1e-12);
    if (db < -35) break;
    if (db <= -6 && db >= -30) pts.push([i * 0.01, db]);
  }
  if (pts.length < 3) {
    // too quick for the fit: three times the time to fall 20 dB
    for (let i = at; i < env.length; i++) if (env[i] < peak / 10) return 3 * (i - at) * 0.01;
    return Infinity;
  }
  const mt = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const md = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const [t, d] of pts) {
    num += (t - mt) * (d - md);
    den += (t - mt) ** 2;
  }
  const slope = num / den;
  return slope < 0 ? -60 / slope : Infinity;
}

/** The largest jump from one sample to the next, as a share of the loudest sample: a click shows as a big one. */
export function worstStep(x: Float32Array, from = 0, to = x.length): number {
  let peak = 1e-9;
  let step = 0;
  for (let i = from + 1; i < to; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    const s = Math.abs(x[i] - x[i - 1]);
    if (s > step) step = s;
  }
  return step / peak;
}

export function peakOf(x: ArrayLike<number>, from = 0, to = x.length): number {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

/**
 * How much a moment stands out as a click: the largest sample-to-sample step within a
 * millisecond of `at`, over the largest step in the `span` seconds after it (or before it, when
 * `after` is false). A note that starts or stops smoothly scores near or under 1; a click (a
 * jump the sound around it does not have) scores several.
 */
export function clickiness(x: Float32Array, rate: number, at: number, after = true, span = 0.03): number {
  const step = (a: number, b: number) => {
    let s = 0;
    for (let i = Math.max(1, Math.round(a * rate)); i < Math.min(x.length, Math.round(b * rate)); i++) s = Math.max(s, Math.abs(x[i] - x[i - 1]));
    return s;
  };
  const here = step(at - 0.001, at + 0.001);
  const around = after ? step(at + 0.002, at + 0.002 + span) : step(at - 0.002 - span, at - 0.002);
  return here / Math.max(around, 1e-6);
}

/** The level in dB of each of the first `count` harmonics of f over a stretch. */
export function harmonics(x: Float32Array, rate: number, f: number, from: number, n: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= count; k++) out.push(k * f < rate / 2 ? 20 * Math.log10(strength(x, rate, k * f, from, n) + 1e-12) : -240);
  return out;
}

/** The slope of a straight line through harmonic levels against octaves (dB an octave). */
export function slope(levels: number[]): number {
  const pts = levels.map((db, i) => [Math.log2(i + 1), db] as [number, number]).filter(([, db]) => db > -200);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return num / den;
}

/**
 * frequencyNear over half-second windows a tenth of a second apart, the highest and lowest
 * quarter left out and the rest averaged: vibrato averages away, and one bad window cannot throw it.
 */
export function steadyFrequency(x: ArrayLike<number>, rate: number, guess: number, from: number, to: number): number {
  const found: number[] = [];
  for (let a = from; a + rate * 0.5 <= to; a += Math.round(rate / 10)) found.push(frequencyNear(x, rate, guess, a, a + Math.round(rate * 0.5)));
  if (!found.length) return frequencyNear(x, rate, guess, from, to);
  found.sort((p, q) => p - q);
  const keep = found.slice(found.length >> 2, found.length - (found.length >> 2));
  return keep.reduce((s, v) => s + v, 0) / keep.length;
}
