// A small synthetic room: the impulse response is made here, so no audio file ships.
//
// The recipe is the old one for artificial reverberation: noise whose loudness falls
// exponentially (Schroeder, "Natural sounding artificial reverberation", JAES 1962; Moorer,
// "About this reverberation business", CMJ 1979), with the high frequencies dying faster than
// the low, as air and soft walls make them do, and a handful of early echoes in front.

/** A small seeded generator (mulberry32), so the room is the same room every time. */
function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

export interface RoomShape {
  /** Seconds for the tail to fall by 60 dB. */
  decay: number;
  /** Seconds of silence before the first echo: the distance to the nearest wall. */
  gap: number;
}

export const ROOM: RoomShape = { decay: 1.3, gap: 0.012 };

/** The room's answer to a click, for each ear, at any sample rate. Each ear's energy sums to 1. */
export function roomImpulse(sampleRate: number, shape: RoomShape = ROOM): [Float32Array, Float32Array] {
  const length = Math.ceil((shape.gap + shape.decay * 1.1) * sampleRate);
  const start = Math.round(shape.gap * sampleRate);
  // -60 dB at `decay` seconds: e^(-6.91 t / decay).
  const fall = 6.91 / (shape.decay * sampleRate);
  const ears: Float32Array[] = [];
  for (let ear = 0; ear < 2; ear++) {
    const random = noise(0x0f1e + ear * 7919);
    const out = new Float32Array(length);
    let low = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / sampleRate;
      // A one-pole low-pass whose corner slides from 9 kHz down to 1.5 kHz as the tail ages.
      const corner = 1500 + 7500 * Math.exp(-t / (shape.decay * 0.3));
      const k = 1 - Math.exp((-2 * Math.PI * Math.min(corner, sampleRate * 0.45)) / sampleRate);
      low += (random() - low) * k;
      // The tail grows in over the first 30 ms: echoes are sparse at first, then dense.
      out[i] = low * Math.exp(-fall * (i - start)) * Math.min(1, t / 0.03);
    }
    // Early echoes: a few walls at different distances, a little different for each ear.
    const echoes = ear === 0 ? [0.0, 0.0113, 0.0197, 0.0311, 0.0437] : [0.0, 0.0127, 0.0211, 0.0293, 0.0463];
    echoes.forEach((seconds, n) => {
      const at = start + Math.round(seconds * sampleRate);
      if (at < length) out[at] += (n % 2 ? -0.5 : 0.6) * 0.75 ** n;
    });
    let energy = 0;
    for (let i = 0; i < length; i++) energy += out[i] * out[i];
    const gain = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < length; i++) out[i] *= gain;
    ears.push(out);
  }
  return [ears[0], ears[1]];
}
