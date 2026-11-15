// The air column on its own: it rings where the theory of tubes says it should, and it holds
// and releases pressure.
import { expect, test } from "bun:test";
import { BODIES, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { Noise } from "../../src/voice/rng.ts";
import { noseAirway } from "../../src/voice/shape.ts";
import { resonances } from "../../src/voice/theory.ts";
import { NOSE_SECTIONS, SECTIONS, Tube } from "../../src/voice/tube.ts";
import { heardFormants, RATE, sung } from "./helpers.ts";
import { fft, rms } from "./measure.ts";

/** Tap a tube at the folds and find the peaks of what leaves the lips, in Hz. */
function ring(area: Float64Array, length: number): number[] {
  const tube = new Tube(new Noise(1));
  const nose = new Float64Array(NOSE_SECTIONS);
  noseAirway({ tract: length, folds: 0.5 }, nose);
  tube.setNose(nose);
  for (let i = 0; i < 2; i++) tube.shape(area, 0, length / SECTIONS, 1);
  const size = 1 << 14;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    tube.f[0] = tube.b[0] + tube.entry * (i === 0 ? 1 : 0);
    tube.step();
    re[i] = tube.lipFlow * (0.5 + 0.5 * Math.cos((Math.PI * i) / size));
  }
  fft(re, im);
  const peaks: number[] = [];
  const mag = (i: number) => Math.hypot(re[i], im[i]);
  const hz = 1 / tube.dt / size;
  for (let i = Math.ceil(120 / hz); i < 5000 / hz; i++) {
    let top = true;
    for (let k = 1; k <= 40 && top; k++) top = mag(i) >= mag(i - k) && mag(i) >= mag(i + k);
    if (top) peaks.push(i * hz);
  }
  return peaks;
}

test("a plain tube 17.5 cm long resonates near 500, 1500 and 2500 Hz", () => {
  const plain = new Float64Array(SECTIONS).fill(3);
  const theory = resonances(plain, 17.5, 3);
  const heard = ring(plain, 17.5);
  [500, 1500, 2500].forEach((hz, i) => {
    expect(Math.abs(theory[i] - hz) / hz).toBeLessThan(0.06);
    expect(Math.abs(heard[i] - theory[i]) / theory[i]).toBeLessThan(0.015);
  });
});

test("a tube of two widths rings where the frequency-domain theory says", () => {
  const two = new Float64Array(SECTIONS).map((_, j) => (j < 24 ? 1 : 7));
  const theory = resonances(two, 16, 3);
  const heard = ring(two, 16);
  theory.forEach((hz, i) => expect(Math.abs(heard[i] - hz) / hz).toBeLessThan(0.02));
});

test("a closed mouth has its lowest resonance near 180 Hz, set by the walls", () => {
  const closed = new Float64Array(SECTIONS).fill(3);
  closed[SECTIONS - 1] = closed[SECTIONS - 2] = 1e-5;
  const [lowest] = resonances(closed, 17.5, 1);
  expect(lowest).toBeGreaterThan(140);
  expect(lowest).toBeLessThan(240);
});

test("a longer throat lowers every resonance in proportion", () => {
  const plain = new Float64Array(SECTIONS).fill(3);
  const short = ring(plain, 13);
  const long = ring(plain, 19.5);
  for (let i = 1; i < 3; i++) expect(short[i] / long[i]).toBeCloseTo(1.5, 1);
});

test("lowering the larynx and rounding the lips lengthen the tube and lower its formants", () => {
  const body = BODIES.tenor;
  const base = { jaw: 0.4, tongueX: 0.6, tongueY: 0.3, lips: 0.6, round: 0.2 };
  const plain = heardFormants(sung(base), body);
  const lowered = heardFormants(sung({ ...base, larynx: -1 }), body);
  const raised = heardFormants(sung({ ...base, larynx: 1 }), body);
  const rounded = heardFormants(sung({ ...base, round: 1 }), body);
  for (let i = 0; i < 3; i++) {
    expect(lowered[i]).toBeLessThan(plain[i]);
    expect(raised[i]).toBeGreaterThan(plain[i]);
  }
  expect(rounded[1]).toBeLessThan(plain[1]);
});

test("air pressure builds behind closed lips and bursts out when they part", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.aim(sung({ lips: 0, glottis: 1, lungs: 0.6, jaw: 0.4 }));
  const shut = new Float32Array(RATE * 0.25);
  voice.render(shut);
  voice.sense(tel);
  expect(tel[T.held]).toBeGreaterThan(0.5);
  expect(rms(shut, RATE * 0.15)).toBeLessThan(0.002);
  voice.aim({ lips: 0.7 });
  const open = new Float32Array(RATE * 0.08);
  voice.render(open);
  let peak = 0;
  for (const v of open) peak = Math.max(peak, Math.abs(v));
  expect(peak).toBeGreaterThan(0.05);
  voice.sense(tel);
  expect(tel[T.held]).toBeLessThan(0.1);
});
