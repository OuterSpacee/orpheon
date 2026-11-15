// The folds: pitch, loudness, and the ways of holding them, measured from the sound.
import { expect, test } from "bun:test";
import { BODIES, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Body, Pose } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { hold, RATE, sung } from "./helpers.ts";
import { pitchOf, powerSpectrum, rms } from "./measure.ts";

const AH: Partial<Pose> = { jaw: 0.7, tongueX: 0.3, tongueY: 0.3, lips: 0.8, round: 0 };

test("the pitch is the pitch asked for, from 60 to 1200 Hz", () => {
  const cases: [Body, number, Partial<Pose>][] = [
    [BODIES.bass, 60, {}],
    [BODIES.bass, 98, {}],
    [BODIES.tenor, 147, {}],
    [BODIES.tenor, 262, {}],
    [BODIES.alto, 349, {}],
    [BODIES.soprano, 523, { register: 0.5 }],
    [BODIES.soprano, 880, { register: 1, lungs: 0.75 }],
    [BODIES.child, 1200, { register: 1, lungs: 0.8 }],
  ];
  for (const [body, pitch, more] of cases) {
    const sound = hold(sung({ ...AH, pitch, ...more }), body, 0.8);
    const heard = pitchOf(sound, RATE, RATE * 0.3, RATE * 0.7, pitch / 1.6, pitch * 1.6);
    // Within 1% (17 cents): the voice wanders by design, a few cents either way.
    expect(Math.abs(heard - pitch) / pitch).toBeLessThan(0.01);
  }
});

test("more breath is louder; no breath is silence", () => {
  const loud = [0.3, 0.45, 0.6, 0.8, 1].map((lungs) => rms(hold(sung({ ...AH, pitch: 140, lungs }), BODIES.tenor, 0.6), RATE * 0.3));
  for (let i = 1; i < loud.length; i++) expect(loud[i]).toBeGreaterThan(loud[i - 1] * 1.1);
  expect(rms(hold(sung({ ...AH, pitch: 140, lungs: 0 }), BODIES.tenor, 0.6), RATE * 0.3)).toBeLessThan(1e-5);
});

test("folds held wide apart give breath, not voice", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.aim(sung({ ...AH, pitch: 140, glottis: 1 }));
  const sound = new Float32Array(RATE * 0.6);
  voice.render(sound);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.sense(tel);
  expect(tel[T.voiced]).toBeLessThan(0.05);
  expect(tel[T.f0]).toBe(0);
  expect(tel[T.flow]).toBeGreaterThan(0.4);
  expect(pitchOf(sound, RATE, RATE * 0.3, RATE * 0.55, 80, 400, 0.5)).toBe(0);
  // The rush of air is heard.
  expect(rms(sound, RATE * 0.3)).toBeGreaterThan(0.001);
});

test("folds squeezed shut stop the air: a glottal stop", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.aim(sung({ ...AH, pitch: 140, glottis: 0 }));
  const sound = new Float32Array(RATE * 0.5);
  voice.render(sound);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.sense(tel);
  expect(rms(sound, RATE * 0.3)).toBeLessThan(1e-4);
  expect(Math.abs(tel[T.flow])).toBeLessThan(0.01);
  expect(tel[T.foldOpen]).toBeLessThan(0.01);
});

test("a closed mouth stops the voice by itself", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.aim(sung({ ...AH, pitch: 140 }));
  voice.render(new Float32Array(RATE * 0.4));
  voice.sense(tel);
  expect(tel[T.voiced]).toBeGreaterThan(0.6);
  // Only the lips move. The folds are still held together and the lungs still push.
  voice.aim({ lips: 0 });
  const early = new Float32Array(RATE * 0.06);
  voice.render(early);
  voice.sense(tel);
  // For a moment the walls of the throat give and the voice goes on behind the lips...
  expect(tel[T.voiced]).toBeGreaterThan(0.2);
  voice.render(new Float32Array(RATE * 0.3));
  voice.sense(tel);
  // ...then the pressure above the folds has caught up with the pressure below.
  expect(tel[T.voiced]).toBeLessThan(0.05);
  expect(tel[T.f0]).toBe(0);
  expect(tel[T.held]).toBeGreaterThan(0.4);
  expect(tel[T.pose + 2]).toBeCloseTo(0.5, 2);
});

test("vibrato swings the pitch by the depth asked for, five or six times a second", () => {
  const sound = hold(sung({ ...AH, pitch: 220, vibrato: 50 }), BODIES.tenor, 2);
  const track: number[] = [];
  for (let t = 0.8; t < 1.9; t += 0.01) track.push(pitchOf(sound, RATE, Math.round(t * RATE), Math.round((t + 0.03) * RATE), 150, 320));
  const cents = track.map((hz) => 1200 * Math.log2(hz / 220));
  const swing = (Math.max(...cents) - Math.min(...cents)) / 2;
  expect(swing).toBeGreaterThan(35);
  expect(swing).toBeLessThan(65);
  let turns = 0;
  for (let i = 1; i < cents.length; i++) if (cents[i - 1] < 0 !== cents[i] < 0) turns++;
  expect(turns / 2 / 1.1).toBeGreaterThan(4.5);
  expect(turns / 2 / 1.1).toBeLessThan(6.8);
});

test("no two cycles are quite alike, and the pitch still holds", () => {
  const sound = hold(sung({ ...AH, pitch: 150 }), BODIES.tenor, 2.2);
  const track: number[] = [];
  for (let t = 0.4; t < 2.1; t += 0.05) track.push(pitchOf(sound, RATE, Math.round(t * RATE), Math.round((t + 0.05) * RATE), 100, 220));
  const mean = track.reduce((a, b) => a + b, 0) / track.length;
  const spread = Math.sqrt(track.reduce((a, b) => a + (b - mean) ** 2, 0) / track.length) / mean;
  expect(spread).toBeGreaterThan(0.0003);
  expect(spread).toBeLessThan(0.01);
});

/** How far the harmonics around 2.5 kHz lie under the first, dB. (Harmonics, not bands: breath noise fills the bands.) */
function tilt(pose: Partial<Pose>, body = BODIES.tenor): number {
  const pitch = 200;
  const sound = hold(sung({ ...AH, pitch, ...pose }), body, 1.2);
  const size = 32768;
  const power = powerSpectrum(sound, RATE * 0.4, size);
  const harmonic = (k: number) => {
    let peak = 0;
    const bin = Math.round((k * pitch * size) / RATE);
    for (let i = bin - 4; i <= bin + 4; i++) peak = Math.max(peak, power[i]);
    return peak;
  };
  let high = 0;
  for (let k = 10; k <= 15; k++) high += harmonic(k) / 6;
  return 10 * Math.log10(harmonic(1) / high);
}

test("chest voice is brighter than falsetto, pressed brighter than breathy", () => {
  expect(tilt({ register: 0 })).toBeLessThan(tilt({ register: 1 }) - 3);
  expect(tilt({ glottis: 0.35 })).toBeLessThan(tilt({ glottis: 0.68 }) - 3);
});

test("falsetto lets air through all the time; chest voice shuts each cycle", () => {
  const open = (register: number) => {
    const voice = createVoice(RATE, BODIES.tenor);
    voice.aim(sung({ ...AH, pitch: 300, register }));
    voice.render(new Float32Array(RATE * 0.5));
    const tel = new Float32Array(TELEMETRY_SIZE);
    voice.sense(tel);
    return tel[T.flow] / Math.max(1e-6, tel[T.level]);
  };
  expect(open(1)).toBeGreaterThan(open(0));
});

test("larger folds are louder and darker at the same pitch and breath", () => {
  const level = (body: Body) => rms(hold(sung({ ...AH, pitch: 220 }), body, 0.6), RATE * 0.3);
  expect(level({ tract: 16, folds: 0.9 })).toBeGreaterThan(level({ tract: 16, folds: 0.1 }));
});
