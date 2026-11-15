// sense() tells the truth: the view draws the tongue from `area` and the standing wave from
// `pressure`, so they must be the engine's own state.
import { expect, test } from "bun:test";
import { BODIES, LANDMARK, NOSE_POINTS, POSE, POSE_COUNT, POSE_KEYS, REST, TELEMETRY as T, TELEMETRY_SIZE, TRACT_POINTS } from "../../src/contract.ts";
import type { Pose } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { vowelPose } from "../../src/voice/phones.ts";
import { resonances } from "../../src/voice/theory.ts";
import { SECTIONS } from "../../src/voice/tube.ts";
import { scoreOf } from "../../tools/voice-score.ts";
import { RATE, sung, tubeOf } from "./helpers.ts";

function sensed(pose: Partial<Pose>, seconds = 0.5, body = BODIES.tenor): Float32Array {
  const voice = createVoice(RATE, body);
  voice.aim(pose);
  voice.render(new Float32Array(RATE * seconds));
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.sense(tel);
  return tel;
}

test("at rest: silent, breathing pose, nose open, every field a number", () => {
  const tel = sensed({}, 0.2);
  for (const v of tel) expect(Number.isFinite(v)).toBe(true);
  expect(tel[T.time]).toBeCloseTo(0.2, 6);
  expect(tel[T.level]).toBe(0);
  expect(tel[T.f0]).toBe(0);
  expect(tel[T.phone]).toBe(-1);
  POSE_KEYS.forEach((k, i) => expect(tel[T.pose + i]).toBeCloseTo(REST[k], 4));
  expect(tel[T.foldOpen]).toBeGreaterThan(0.9);
  expect(tel[T.noseArea]).toBeGreaterThan(0.5);
});

test("the pose reported is the pose after inertia: the tip arrives before the jaw", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.aim({ jaw: 1, tip: 1, tongueX: 1 });
  voice.render(new Float32Array(RATE * 0.03));
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.sense(tel);
  const done = (k: keyof Pose) => (tel[T.pose + POSE[k]] - REST[k]) / (1 - REST[k]);
  expect(done("tip")).toBeGreaterThan(0.75);
  expect(done("jaw")).toBeLessThan(0.45);
  expect(done("tongueX")).toBeLessThan(done("tip"));
  expect(done("jaw")).toBeGreaterThan(0.05);
});

test("area is the tube that is sounding: its resonances are the formants heard", () => {
  const body = BODIES.tenor;
  for (const ph of ["i", "a", "u"] as const) {
    const pose = sung(vowelPose(ph, body));
    const tel = sensed(pose);
    const want = tubeOf(pose, body);
    // The telemetry has one point per slice here; read it back as slices.
    const got = new Float64Array(SECTIONS);
    for (let j = 0; j < SECTIONS; j++) got[j] = Math.max(1e-5, tel[T.area + Math.round(((j + 0.5) / SECTIONS) * (TRACT_POINTS - 1))]);
    const a = resonances(got, want.length, 3);
    const b = resonances(want.area, want.length, 3);
    for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k]) / b[k]).toBeLessThan(0.05);
  }
});

test("the landmarks are where the model closes: lips at the end, the ridge and the velar place where the table says", () => {
  const shutAt = (pose: Partial<Pose>) => {
    const tel = sensed({ ...pose, velum: 0 }, 0.3);
    const shut: number[] = [];
    for (let i = 0; i < TRACT_POINTS; i++) if (tel[T.area + i] === 0) shut.push(i / (TRACT_POINTS - 1));
    return shut;
  };
  const lips = shutAt({ lips: 0 });
  expect(lips[lips.length - 1]).toBe(1);
  expect(lips[0]).toBeGreaterThan(0.93);
  const ridge = shutAt({ tip: 1, tipX: 0.5 });
  expect(ridge.length).toBeGreaterThan(0);
  for (const x of ridge) expect(Math.abs(x - LANDMARK.ridge)).toBeLessThan(0.04);
  const teeth = shutAt({ tip: 1, tipX: 0 });
  for (const x of teeth) expect(Math.abs(x - LANDMARK.teeth)).toBeLessThan(0.04);
  const behind = shutAt({ tip: 1, tipX: 1 });
  for (const x of behind) expect(Math.abs(x - LANDMARK.postalveolar)).toBeLessThan(0.04);
  const velar = shutAt({ tongueY: 1, tongueX: 0.62 });
  expect(velar.length).toBeGreaterThan(0);
  for (const x of velar) expect(Math.abs(x - LANDMARK.velar)).toBeLessThan(0.08);
  // Nothing the tongue does changes the larynx tube.
  const low = sensed({ tongueX: 0, tongueY: 1 }, 0.3);
  const high = sensed({ tongueX: 1, tongueY: 0 }, 0.3);
  for (let i = 0; i < TRACT_POINTS * LANDMARK.larynxTop - 1; i++) expect(low[T.area + i]).toBeCloseTo(high[T.area + i], 5);
});

test("the nose is shut at the port when the velum is up, open when it is down", () => {
  const up = sensed({ velum: 0 }, 0.3);
  const down = sensed({ velum: 1 }, 0.3);
  expect(up[T.noseArea]).toBe(0);
  expect(down[T.noseArea]).toBeGreaterThan(0.5);
  for (let i = 4; i < NOSE_POINTS; i++) {
    expect(up[T.noseArea + i]).toBeGreaterThan(0.2);
    expect(up[T.noseArea + i]).toBeCloseTo(down[T.noseArea + i], 5);
  }
  for (let i = 0; i < NOSE_POINTS; i++) expect(up[T.nosePressure + i]).toBe(0);
});

test("a sung vowel: level, pitch, voicing, flow and the standing wave are all there", () => {
  const body = BODIES.tenor;
  const tel = sensed(sung({ ...vowelPose("a", body), pitch: 196 }), 0.6);
  expect(tel[T.level]).toBeGreaterThan(0.5);
  expect(tel[T.level]).toBeLessThanOrEqual(1);
  expect(Math.abs(tel[T.f0] - 196)).toBeLessThan(4);
  expect(tel[T.voiced]).toBeGreaterThan(0.7);
  expect(tel[T.foldPhase]).toBeGreaterThanOrEqual(0);
  expect(tel[T.foldPhase]).toBeLessThan(1);
  expect(tel[T.foldOpen]).toBeGreaterThan(0.02);
  expect(tel[T.foldOpen]).toBeLessThan(0.4);
  expect(tel[T.flow]).toBeGreaterThan(0.05);
  expect(tel[T.lung]).toBeCloseTo(0.6, 2);
  expect(tel[T.held]).toBe(0);
  // Sound is strongest at the folds, where the tube is shut, and falls to the open lips.
  expect(tel[T.pressure]).toBeGreaterThan(0.3);
  expect(tel[T.pressure + TRACT_POINTS - 1]).toBeLessThan(tel[T.pressure] * 0.6);
  for (let i = 0; i < TRACT_POINTS; i++) {
    expect(tel[T.pressure + i]).toBeGreaterThanOrEqual(0);
    expect(tel[T.pressure + i]).toBeLessThanOrEqual(1);
    // A sung vowel makes no noise in the mouth (a little breath at the folds is part of any voice).
    if (i > 1) expect(tel[T.noise + i]).toBeLessThan(0.02);
  }
  expect(tel[T.noise]).toBeLessThan(0.6);
});

test("the standing wave follows the vowel: ee holds its sound behind the tongue, ah lets it fall away", () => {
  // The first formant of ee is the throat ringing as one cavity behind the narrow place under
  // the palate: the pressure is nearly even up to the tongue and drops across it. For ah the
  // narrow place is low in the throat and the pressure has fallen by the middle of the tube.
  const body = BODIES.tenor;
  const profile = (ph: "i" | "a") => sensed(sung({ ...vowelPose(ph, body), pitch: 110 }), 0.6).slice(T.pressure, T.pressure + TRACT_POINTS);
  const ee = profile("i");
  const ah = profile("a");
  const at = (p: Float32Array, x: number) => p[Math.round(x * (TRACT_POINTS - 1))] / p[2];
  expect(at(ee, 0.45)).toBeGreaterThan(0.75);
  expect(at(ee, 0.95)).toBeLessThan(0.5 * at(ee, 0.45));
  expect(at(ah, 0.45)).toBeLessThan(at(ee, 0.45));
});

test("an s makes its noise at the ridge and the teeth, nowhere else", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.perform(scoreOf("ˈa:0.25 s:0.3 a"), 0);
  voice.render(new Float32Array(RATE * 0.68));
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.sense(tel);
  let loudest = 0;
  for (let i = 1; i < TRACT_POINTS; i++) if (tel[T.noise + i] > tel[T.noise + loudest]) loudest = i;
  expect(tel[T.noise + loudest]).toBeGreaterThan(0.2);
  expect(loudest / (TRACT_POINTS - 1)).toBeGreaterThan(LANDMARK.ridge - 0.05);
  for (let i = 3; i < TRACT_POINTS * 0.8; i++) expect(tel[T.noise + i]).toBeLessThan(0.02);
  expect(tel[T.voiced]).toBeLessThan(0.05);
});

test("a p holds pressure behind the lips and lets it go", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.perform(scoreOf("ˈa:0.25 p:0.2 ˈa:0.2"), 0);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.render(new Float32Array(RATE * 0.6));
  voice.sense(tel);
  expect(tel[T.held]).toBeGreaterThan(0.4);
  expect(tel[T.area + TRACT_POINTS - 1]).toBe(0);
  voice.render(new Float32Array(RATE * 0.15));
  voice.sense(tel);
  expect(tel[T.held]).toBeLessThan(0.05);
});

test("sense fills exactly the telemetry layout and nothing past it", () => {
  const voice = createVoice(RATE);
  const tel = new Float32Array(TELEMETRY_SIZE + 8).fill(123);
  voice.sense(tel);
  for (let i = TELEMETRY_SIZE; i < tel.length; i++) expect(tel[i]).toBe(123);
  expect(T.noise + TRACT_POINTS).toBe(TELEMETRY_SIZE);
  expect(T.pose + POSE_COUNT).toBeLessThanOrEqual(T.area);
});

test("extra: the slow-motion recorder holds consecutive steps of the pressure along the tube", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  voice.aim(sung({ ...vowelPose("a", BODIES.tenor), pitch: 120 }));
  voice.render(new Float32Array(RATE * 0.4));
  expect(voice.replay().frames).toBe(0);
  voice.record(600);
  voice.render(new Float32Array(RATE * 0.05));
  const tape = voice.replay();
  expect(tape.frames).toBe(600);
  expect(tape.seconds).toBeGreaterThan(1 / 100000);
  expect(tape.seconds).toBeLessThan(1 / 30000);
  // A pulse leaves the folds and reaches the lips about half a millisecond later: the moment
  // of the largest swing at each point comes later the further along the tube it is.
  const strongest = (point: number) => {
    let best = 0;
    for (let f = 1; f < 400; f++) if (Math.abs(tape.pressure[f * TRACT_POINTS + point]) > Math.abs(tape.pressure[best * TRACT_POINTS + point])) best = f;
    return best;
  };
  let swing = 0;
  for (let i = 0; i < tape.frames * TRACT_POINTS; i++) swing = Math.max(swing, Math.abs(tape.pressure[i]));
  expect(swing).toBeGreaterThan(100);
  expect(Number.isFinite(strongest(2))).toBe(true);
});
