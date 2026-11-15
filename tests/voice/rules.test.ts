// The rules every voice must keep: nothing allocated while rendering, the same
// samples whatever the block size, sound at any device rate, never a NaN, the same output for
// the same input.
import { expect, test } from "bun:test";
import { heapStats } from "bun:jsc";
import { BODIES, POSE_KEYS, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Body, Pose } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { scoreOf } from "../../tools/voice-score.ts";
import { pitchOf, rms } from "./measure.ts";

const LINE = "ˈs i ŋ | ə | ˈs ɔː ŋ _:0.4 ˈp a t ə k a | ˈʃ uː z | ˈb ɹ ɛ d";

function performed(blockSize: number, rate = 48000, body: Body = BODIES.tenor, seconds = 2.6): Float32Array {
  const voice = createVoice(rate, body);
  voice.perform(scoreOf(LINE, { body }), 0);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let at = 0; at < out.length; at += blockSize) voice.render(out.subarray(at, Math.min(out.length, at + blockSize)));
  return out;
}

test("the output does not depend on the block size", () => {
  const whole = performed(4096);
  for (const size of [128, 1, 1000, 37]) {
    const other = performed(size);
    let differ = -1;
    for (let i = 0; i < whole.length && differ < 0; i++) if (whole[i] !== other[i]) differ = i;
    expect(differ).toBe(-1);
  }
});

test("the same input gives the same output: the noise is seeded", () => {
  const a = performed(512);
  const b = performed(512);
  expect(a).toEqual(b);
  expect(rms(a)).toBeGreaterThan(0.01);
});

test("render and sense allocate nothing", () => {
  const voice = createVoice(48000, BODIES.alto);
  const block = new Float32Array(128);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.perform(scoreOf(LINE + " _:0.3 " + LINE, { body: BODIES.alto }), 0);
  // Let the engine warm up, so what is counted is the steady state.
  for (let i = 0; i < 400; i++) voice.render(block);
  voice.sense(tel);
  Bun.gc(true);
  const before = heapStats().objectCount;
  for (let i = 0; i < 2500; i++) {
    voice.render(block);
    if (i % 3 === 0) voice.sense(tel);
    if (i % 50 === 0) voice.aim({ jaw: 0.5 });
  }
  const after = heapStats().objectCount;
  // 2500 blocks are 320000 samples. A single allocation per block, let alone per sample, would
  // show as thousands of objects; the few allowed here are the test runner's own.
  expect(after - before).toBeLessThan(100);
});

test("the voice holds at every device rate from 8 kHz to 192 kHz", () => {
  let reference = 0;
  for (const rate of [48000, 8000, 11025, 16000, 22050, 32000, 44100, 88200, 96000, 192000]) {
    const voice = createVoice(rate, BODIES.tenor);
    voice.aim({ lungs: 0.6, glottis: 0.5, velum: 0, pitch: 150, jaw: 0.6, tongueX: 0.3, tongueY: 0.3, lips: 0.8 });
    const out = new Float32Array(rate);
    voice.render(out);
    for (const v of out) if (!Number.isFinite(v)) throw new Error(`not a number at ${rate} Hz`);
    const level = rms(out, rate * 0.4);
    if (!reference) reference = level;
    // The same vowel at the same loudness (a low rate loses only what lies above half of it)...
    expect(Math.abs(20 * Math.log10(level / reference))).toBeLessThan(1.5);
    // ...and at the same pitch.
    expect(Math.abs(pitchOf(out, rate, rate * 0.4, rate * 0.9, 100, 220) - 150)).toBeLessThan(1.5);
    // A whole performance, consonants and all, stays finite too.
    for (const v of performed(256, rate, BODIES.tenor, 1.2)) if (!Number.isFinite(v)) throw new Error(`not a number at ${rate} Hz`);
  }
});

test("any body sings, from far smaller than a child to far larger than a bass", () => {
  for (const body of [{ tract: 4, folds: 0 }, { tract: 9, folds: 0 }, BODIES.child, BODIES.bass, { tract: 24, folds: 1 }, { tract: 60, folds: 3 }, { tract: NaN, folds: NaN }]) {
    const out = performed(128, 48000, body, 1.2);
    for (const v of out) if (!Number.isFinite(v)) throw new Error(`not a number for tract ${body.tract}`);
    expect(rms(out)).toBeGreaterThan(0.003);
  }
});

test("random extreme poses never break it", () => {
  let seed = 7;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const rate of [8000, 48000, 192000]) {
    const voice = createVoice(rate, BODIES.soprano);
    const block = new Float32Array(Math.round(rate * 0.004));
    const tel = new Float32Array(TELEMETRY_SIZE);
    for (let i = 0; i < 1500; i++) {
      if (random() < 0.4) {
        const pose: Partial<Pose> = {};
        for (const key of POSE_KEYS) {
          if (random() < 0.5) continue;
          const wild = random();
          pose[key] = wild < 0.03 ? NaN : wild < 0.06 ? Infinity : wild < 0.09 ? -1e9 : key === "pitch" ? 20 + 3000 * random() : key === "vibrato" ? 400 * random() : -0.5 + 2 * random();
        }
        voice.aim(pose);
      }
      if (random() < 0.01) voice.setBody({ tract: 6 + 20 * random(), folds: random() });
      voice.render(block);
      for (const v of block) if (!(v >= -1 && v <= 1)) throw new Error(`sample ${v} at ${rate} Hz`);
      voice.sense(tel);
      for (const v of tel) if (!Number.isFinite(v)) throw new Error(`telemetry ${v} at ${rate} Hz`);
    }
  }
}, 60000);

test("the clock counts rendered samples", () => {
  const voice = createVoice(44100);
  expect(voice.sampleRate).toBe(44100);
  expect(voice.time).toBe(0);
  voice.render(new Float32Array(441));
  voice.render(new Float32Array(4410));
  expect(voice.time).toBeCloseTo(0.11, 9);
});
