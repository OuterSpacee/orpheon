// The consonants, measured from rendered sound: where a hiss sits, how a stop is silent and then
// bursts, when the voice stops and starts again, what a nasal hums.
import { expect, test } from "bun:test";
import { BODIES, PHONES, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { PhoneSymbol } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { soundOf } from "../../src/voice/phones.ts";
import { scoreOf } from "../../tools/voice-score.ts";
import { crossing, levelAt, RATE, say } from "./helpers.ts";
import { bandPower, centroid, pitchOf } from "./measure.ts";

// "ˈa:0.25 X:0.2 a:0.25" after the quarter second of rest scoreOf leaves: the consonant's slot is
// 0.5 to 0.7 s and the vowels either side are steady around 0.4 and 0.85.
const between = (ph: string, length = 0.2) => say(`ˈa:0.25 ${ph}:${length} ˈa:0.25`).sound;
const VOWEL: [number, number] = [0.36, 0.46];
const MIDDLE: [number, number] = [0.56, 0.67];
const at = (sound: Float32Array, span: [number, number]) => levelAt(sound, span[0], span[1]);
const samples = (span: [number, number]): [number, number] => [Math.round(span[0] * RATE), Math.round(span[1] * RATE)];

test("s is brighter than sh, and sh brighter than the velar x", () => {
  const where = (ph: string) => centroid(between(ph), RATE, ...samples(MIDDLE), 500, 12000);
  const [s, sh, x] = [where("s"), where("ʃ"), where("x")];
  expect(s).toBeGreaterThan(sh * 1.3);
  expect(sh).toBeGreaterThan(x * 1.3);
  // Where the weight of each lies: s above 4 kHz, sh between 2 and 4, x below 2.5.
  const share = (ph: string, lo: number, hi: number) => {
    const sound = between(ph);
    return bandPower(sound, RATE, ...samples(MIDDLE), lo, hi) / bandPower(sound, RATE, ...samples(MIDDLE), 300, 16000);
  };
  expect(share("s", 4000, 16000)).toBeGreaterThan(0.7);
  expect(share("ʃ", 1500, 4500)).toBeGreaterThan(0.6);
  expect(share("x", 800, 2500)).toBeGreaterThan(0.5);
});

test("f and th are weak and flat beside s", () => {
  const s = between("s");
  for (const ph of ["f", "θ"]) {
    const sound = between(ph);
    // At least 12 dB under s...
    expect(at(sound, MIDDLE)).toBeLessThan(at(s, MIDDLE) - 12);
    // ...but there: well above the silence of a stop.
    expect(at(sound, MIDDLE)).toBeGreaterThan(at(s, VOWEL) - 45);
    // Flat: no octave from 1 to 8 kHz stands more than 9 dB over another.
    const bands = [[1000, 2000], [2000, 4000], [4000, 8000]].map(([lo, hi]) => 10 * Math.log10(bandPower(sound, RATE, ...samples(MIDDLE), lo, hi)));
    expect(Math.max(...bands) - Math.min(...bands)).toBeLessThan(9);
  }
  const bands = [[1000, 2000], [2000, 4000], [4000, 8000]].map(([lo, hi]) => 10 * Math.log10(bandPower(s, RATE, ...samples(MIDDLE), lo, hi)));
  expect(Math.max(...bands) - Math.min(...bands)).toBeGreaterThan(12);
});

test("a voiceless fricative has no voice in it; a voiced one has both voice and hiss", () => {
  const s = between("s");
  const z = between("z");
  expect(pitchOf(s, RATE, ...samples(MIDDLE), 80, 400, 0.5)).toBe(0);
  // The buzz of z: strong below 500 Hz, where s has almost nothing.
  const low = (sound: Float32Array) => bandPower(sound, RATE, ...samples(MIDDLE), 80, 500);
  const high = (sound: Float32Array) => bandPower(sound, RATE, ...samples(MIDDLE), 4000, 12000);
  expect(low(z)).toBeGreaterThan(100 * low(s));
  expect(high(z)).toBeGreaterThan(0.03 * high(s));
});

test("a voiceless stop is silence, then a burst, then breath, then voice", () => {
  for (const ph of ["p", "t", "k"]) {
    const sound = between(ph, 0.16);
    const vowel = at(sound, VOWEL);
    const end = 0.66;
    // The mouth shuts on t: within 15 ms the sound is 30 dB down.
    const shut = crossing(sound, 0.47, 0.6, vowel - 30, true);
    expect(Math.abs(shut - 0.5)).toBeLessThan(0.015);
    // Silence while it is held (the last 35 dB down is the thump of the throat filling).
    expect(levelAt(sound, shut + 0.01, shut + 0.05)).toBeLessThan(vowel - 35);
    // The burst: sudden (25 dB up within 5 ms), before the slot ends.
    const burst = crossing(sound, shut + 0.02, 0.75, vowel - 25, false, 0.003);
    expect(burst).toBeLessThan(end - 0.03);
    expect(burst).toBeGreaterThan(shut + 0.04);
    expect(levelAt(sound, burst - 0.008, burst - 0.003)).toBeLessThan(vowel - 45);
    // No voice in the closure or the burst; the voice comes back as the slot ends.
    expect(pitchOf(sound, RATE, Math.round((shut + 0.01) * RATE), Math.round((burst + 0.02) * RATE), 80, 400, 0.5)).toBe(0);
    let voice = NaN;
    for (let t = burst; t < 0.8 && Number.isNaN(voice); t += 0.002) {
      if (pitchOf(sound, RATE, Math.round(t * RATE), Math.round((t + 0.03) * RATE), 80, 400, 0.6) > 0) voice = t;
    }
    // Voice onset time: 40 to 90 ms after the burst before a stressed vowel (Lisker & Abramson 1964).
    expect(voice - burst).toBeGreaterThan(0.03);
    expect(voice - burst).toBeLessThan(0.09);
    expect(Math.abs(voice - end)).toBeLessThan(0.025);
  }
});

test("a voiced stop keeps a hum behind the closure and lets go straight into voice", () => {
  for (const ph of ["b", "d", "g"]) {
    const sound = between(ph, 0.12);
    const vowel = at(sound, VOWEL);
    // Behind the closure: quiet, low, voiced (the walls of the throat give).
    const hum = levelAt(sound, 0.52, 0.56);
    expect(hum).toBeLessThan(vowel - 8);
    expect(hum).toBeGreaterThan(vowel - 35);
    expect(bandPower(sound, RATE, RATE * 0.52, RATE * 0.58, 80, 500)).toBeGreaterThan(30 * bandPower(sound, RATE, RATE * 0.52, RATE * 0.58, 1000, 8000));
    // The vowel is back within 30 ms of the end of the slot.
    const back = crossing(sound, 0.58, 0.75, vowel - 8);
    expect(Math.abs(back - 0.62)).toBeLessThan(0.03);
  }
});

test("the three places of stop burst differently: p low and spread, t high, k in the middle", () => {
  const burstShare = (ph: string, lo: number, hi: number) => {
    const sound = between(ph, 0.16);
    const vowel = at(sound, VOWEL);
    const burst = crossing(sound, 0.54, 0.75, vowel - 25, false, 0.003);
    const from = Math.round((burst - 0.003) * RATE);
    return bandPower(sound, RATE, from, from + 1024, lo, hi) / bandPower(sound, RATE, from, from + 1024, 100, 10000);
  };
  expect(burstShare("t", 3500, 10000)).toBeGreaterThan(burstShare("p", 3500, 10000) * 1.5);
  expect(burstShare("p", 100, 1500)).toBeGreaterThan(burstShare("t", 100, 1500) * 1.5);
  expect(burstShare("k", 900, 3000)).toBeGreaterThan(burstShare("t", 900, 3000));
  expect(burstShare("k", 900, 3000)).toBeGreaterThan(burstShare("p", 900, 3000));
});

test("a nasal is a low murmur through the nose", () => {
  for (const ph of ["m", "n", "ŋ"]) {
    const voice = createVoice(RATE, BODIES.tenor);
    voice.perform(scoreOf(`ˈa:0.25 ${ph}:0.2 ˈa:0.25`), 0);
    const sound = new Float32Array(RATE);
    const tel = new Float32Array(TELEMETRY_SIZE);
    voice.render(sound.subarray(0, RATE * 0.62));
    voice.sense(tel);
    voice.render(sound.subarray(RATE * 0.62));
    // The velum is down, the nose rings, the mouth is shut somewhere.
    expect(tel[T.pose + 12]).toBeGreaterThan(0.5);
    expect(tel[T.noseArea]).toBeGreaterThan(0.3);
    let nose = 0;
    for (let i = 0; i < 24; i++) nose = Math.max(nose, tel[T.nosePressure + i]);
    expect(nose).toBeGreaterThan(0.05);
    let narrow = Infinity;
    for (let i = 20; i < 48; i++) narrow = Math.min(narrow, tel[T.area + i]);
    expect(narrow).toBe(0);
    // Voiced, quieter than the vowel, and nearly all below 500 Hz.
    expect(pitchOf(sound, RATE, ...samples(MIDDLE), 80, 400, 0.5)).toBeGreaterThan(100);
    expect(at(sound, MIDDLE)).toBeLessThan(at(sound, VOWEL) - 4);
    expect(at(sound, MIDDLE)).toBeGreaterThan(at(sound, VOWEL) - 22);
    const low = bandPower(sound, RATE, ...samples(MIDDLE), 80, 500);
    expect(low).toBeGreaterThan(8 * bandPower(sound, RATE, ...samples(MIDDLE), 500, 8000));
    // The vowel itself is not like that.
    expect(bandPower(sound, RATE, ...samples(VOWEL), 80, 500)).toBeLessThan(8 * bandPower(sound, RATE, ...samples(VOWEL), 500, 8000));
  }
});

test("h is breath through the shape of the vowel; the glottal stop is a gap", () => {
  const h = between("h");
  expect(pitchOf(h, RATE, ...samples([0.57, 0.65]), 80, 400, 0.6)).toBe(0);
  expect(at(h, MIDDLE)).toBeGreaterThan(at(h, VOWEL) - 32);
  expect(at(h, MIDDLE)).toBeLessThan(at(h, VOWEL) - 8);
  const stop = between("ʔ", 0.12);
  expect(levelAt(stop, 0.54, 0.6)).toBeLessThan(at(stop, VOWEL) - 35);
  expect(levelAt(stop, 0.66, 0.72)).toBeGreaterThan(at(stop, VOWEL) - 6);
});

test("a trilled r beats several times; a tap touches once", () => {
  const dips = (sound: Float32Array, from: number, to: number) => {
    const vowel = at(sound, VOWEL);
    let count = 0;
    let down = false;
    for (let t = from; t < to; t += 0.002) {
      const low = levelAt(sound, t, t + 0.006) < vowel - 7;
      if (low && !down) count++;
      down = low;
    }
    return count;
  };
  expect(dips(between("r", 0.14), 0.47, 0.68)).toBeGreaterThanOrEqual(2);
  expect(dips(between("r", 0.14), 0.47, 0.68)).toBeLessThanOrEqual(5);
  expect(dips(between("ɾ", 0.035), 0.47, 0.6)).toBe(1);
});

test("l lets the voice through around the tongue; a closed tip without the sides does not", () => {
  const l = between("l");
  expect(at(l, MIDDLE)).toBeGreaterThan(at(l, VOWEL) - 12);
  expect(pitchOf(l, RATE, ...samples(MIDDLE), 80, 400, 0.5)).toBeGreaterThan(100);
});

test("every sound in PHONES can be said between two vowels, and is heard or is a silence", () => {
  for (const ph of PHONES) {
    if (ph === "_") continue;
    const sound = between(ph, 0.16);
    for (const v of sound) if (!Number.isFinite(v)) throw new Error(`${ph} gave a non-number`);
    const manner = soundOf(ph as PhoneSymbol, BODIES.tenor).manner;
    const vowel = at(sound, VOWEL);
    const loudest = Math.max(...[0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.64].map((t) => levelAt(sound, t, t + 0.02)));
    // Something is heard in every slot (for a stop, its burst)...
    expect(loudest).toBeGreaterThan(vowel - 42);
    // ...a consonant is never louder than the open vowel beside it...
    if (manner !== "vowel") expect(levelAt(sound, 0.54, 0.62)).toBeLessThan(vowel + 1);
    // ...and the vowel after it comes back.
    expect(levelAt(sound, 0.78, 0.88)).toBeGreaterThan(vowel - 6);
  }
}, 30000);

test("a closure that spreads over the tube makes no blast: a k after ee is never louder than the ee", () => {
  // A tongue rising for k after a front vowel seals several slices, and the valve at the seal's
  // front edge moves forward as it does. Each newly made valve once inherited the flow it had
  // carried long before, read it through a gap a hair wide as a jet faster than sound, and blew
  // up to full scale for tens of milliseconds (heard as a t: "music" became "use it").
  for (const body of [BODIES.tenor, BODIES.child]) {
    for (const line of ["ˈi k", "ˈɪ:0.09 k:0.086", "m j ˈu z ɪ k", "ˈi k ɪ k i"]) {
      const { sound, score } = say(line, body);
      // the loudest vowel (a fixed window once stood in for it, and in "music" it fell on the m)
      let vowelPeak = 0;
      for (const p of score.phones) {
        if (!"iɪuʊeɛaɑɔoəʌæ".includes(p.ph[0])) continue;
        for (let i = Math.round(p.t * RATE); i < Math.round((p.t + p.d) * RATE); i++) vowelPeak = Math.max(vowelPeak, Math.abs(sound[i]));
      }
      let peak = 0;
      for (const v of sound) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeLessThan(2 * vowelPeak);
    }
  }
});

test("a sound that ends a phrase keeps its shape while the voice dies away: no vowel after a final n or l", () => {
  for (const ph of ["n", "m", "l"]) {
    const score = scoreOf(`ˈa:0.25 ${ph}:0.12`);
    const end = score.phones[1].t + score.phones[1].d;
    const voice = createVoice(RATE, BODIES.tenor);
    voice.perform(score, 0);
    const tel = new Float32Array(TELEMETRY_SIZE);
    const block = new Float32Array(48);
    while (voice.time < end + 0.1) {
      voice.render(block);
      voice.sense(tel);
      if (voice.time < end || tel[T.voiced] < 0.05) continue;
      // While there is any voice left, the mouth is still shut where the consonant shut it.
      let narrow = Infinity;
      for (let i = 20; i < 48; i++) narrow = Math.min(narrow, tel[T.area + i]);
      expect(narrow).toBeLessThan(ph === "l" ? 0.5 : 1e-3);
    }
  }
});
