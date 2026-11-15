// The performer keeps the contract's timing: what a listener hears as the start of each sound
// lands on its slot's t. And it follows the score's curves.
import { expect, test } from "bun:test";
import { BODIES, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Score } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";
import { renderScore, scoreOf } from "../../tools/voice-score.ts";
import { crossing, levelAt, RATE, say } from "./helpers.ts";
import { bandPower, pitchOf, rms } from "./measure.ts";

/** The level of the loudest 50 ms of a sound, dB. */
function loudest(sound: Float32Array): number {
  let best = -Infinity;
  for (let t = 0; t + 0.05 < sound.length / RATE; t += 0.01) best = Math.max(best, levelAt(sound, t, t + 0.05));
  return best;
}

test("a vowel after a rest: its voice arrives on t", () => {
  // scoreOf starts the first sound at 0.25 s.
  for (const line of ["ˈa:0.4", "ˈi:0.4", "ˈu:0.4"]) {
    const { sound } = say(line);
    const arrives = crossing(sound, 0.1, 0.6, loudest(sound) - 15);
    expect(Math.abs(arrives - 0.25)).toBeLessThan(0.02);
    expect(levelAt(sound, 0.05, 0.2)).toBeLessThan(loudest(sound) - 50);
  }
});

test("an utterance's first voiced sound: the voice is half up on its t and fully up soon after", () => {
  // Measured with the folds' own telemetry, against the voicing of the vowel once it is steady.
  for (const line of ["ˈa:0.3", "m:0.08 ˈa:0.3", "n:0.08 ˈo:0.3", "l:0.08 ˈa:0.3", "w:0.07 ˈa:0.3", "ɹ:0.07 ˈa:0.3", "j:0.07 ˈa:0.3"]) {
    const score = scoreOf(line);
    const voice = createVoice(RATE, BODIES.tenor);
    voice.perform(score, 0);
    const tel = new Float32Array(TELEMETRY_SIZE);
    const block = new Float32Array(48);
    const trace: [number, number][] = [];
    const vowel = score.phones[score.phones.length - 1];
    while (voice.time < vowel.t + 0.12) {
      voice.render(block);
      voice.sense(tel);
      trace.push([voice.time, tel[T.voiced]]);
    }
    const held = trace.filter(([t]) => t > vowel.t + 0.06);
    const steady = held.reduce((sum, [, v]) => sum + v, 0) / held.length;
    const reaches = (part: number) => trace.find(([, v]) => v >= part * steady)![0] - score.phones[0].t;
    // Not heard early, not swallowed: half its strength within 10 ms of t either way, and nine
    // tenths within 40 ms of the vowel's own start (an onset in speech takes a few tens of
    // milliseconds; inside a narrowed w or m the folds swing less, so the count runs to the vowel).
    expect(Math.abs(reaches(0.5))).toBeLessThan(0.01);
    expect(reaches(0.1)).toBeGreaterThan(-0.02);
    expect(reaches(0.9)).toBeLessThan(vowel.t - score.phones[0].t + 0.04);
  }
});

test("a vowel after a consonant: the consonant lets go on the vowel's t", () => {
  // The consonant's slot is 0.25..0.4 and the vowel starts at 0.4.
  for (const ph of ["m", "n", "b", "d", "g", "z", "v", "w"]) {
    const { sound } = say(`${ph}:0.15 ˈa:0.3`);
    // The open vowel is told from a hum or a murmur by its sound between 1 and 4 kHz.
    const bright = (t: number) => 10 * Math.log10(bandPower(sound, RATE, Math.round(t * RATE), Math.round(t * RATE) + 1024, 1000, 4000) + 1e-12);
    const full = bright(0.55);
    let arrives = NaN;
    for (let t = 0.3; t < 0.6 && Number.isNaN(arrives); t += 0.002) if (bright(t - 0.0107) > full - 8) arrives = t;
    expect(Math.abs(arrives - 0.4)).toBeLessThan(0.03);
  }
});

test("a fricative: the hiss starts on t and the voice before it has stopped", () => {
  // a 0.25..0.5, the fricative 0.5..0.7, a from 0.7.
  for (const ph of ["s", "ʃ"]) {
    const { sound } = say(`ˈa:0.25 ${ph}:0.2 ˈa:0.25`);
    const hiss = (t: number) => 10 * Math.log10(bandPower(sound, RATE, Math.round(t * RATE), Math.round(t * RATE) + 1024, 2500, 12000) + 1e-12);
    const steady = hiss(0.6);
    let starts = NaN;
    for (let t = 0.4; t < 0.65 && Number.isNaN(starts); t += 0.002) if (hiss(t - 0.0107) > steady - 5) starts = t;
    expect(Math.abs(starts - 0.5)).toBeLessThan(0.02);
    expect(pitchOf(sound, RATE, RATE * 0.53, RATE * 0.67, 80, 400, 0.5)).toBe(0);
    // And the vowel after it is back on its own t.
    const back = crossing(sound, 0.6, 0.85, levelAt(sound, 0.8, 0.9) - 6);
    expect(Math.abs(back - 0.7)).toBeLessThan(0.03);
  }
});

test("a stop: the mouth shuts on t, and the next voice arrives as the slot ends", () => {
  for (const ph of ["p", "t", "k", "tʃ"]) {
    const { sound } = say(`ˈa:0.25 ${ph}:0.15 ˈa:0.25`);
    const vowel = levelAt(sound, 0.36, 0.46);
    const shut = crossing(sound, 0.45, 0.6, vowel - 30, true);
    expect(Math.abs(shut - 0.5)).toBeLessThan(0.015);
    let voice = NaN;
    for (let t = 0.56; t < 0.8 && Number.isNaN(voice); t += 0.002) {
      if (pitchOf(sound, RATE, Math.round(t * RATE), Math.round((t + 0.03) * RATE), 80, 400, 0.6) > 0) voice = t;
    }
    expect(Math.abs(voice - 0.65)).toBeLessThan(0.025);
  }
});

test("a stop before a rest bursts just before its slot ends (a beat lands where it is written)", () => {
  // p, ts and k as a kick, a hat and a snare: each slot 0.12 s, a rest after each.
  const { sound } = say("p:0.12 _:0.2 ts:0.12 _:0.2 k:0.12 _:0.2");
  const ends = [0.37, 0.69, 1.01];
  const peak = loudest(sound);
  for (const end of ends) {
    const burst = crossing(sound, end - 0.1, end + 0.05, peak - 25, false, 0.003);
    expect(burst).toBeGreaterThan(end - 0.09);
    expect(burst).toBeLessThan(end);
  }
});

test("the sounding pitch keeps time with the score's pitch curve: no lag behind a moving note", () => {
  // A leap of a fifth, gliding over 60 ms. The pitch has inertia, so it is aimed ahead by the
  // lag that inertia gives; the sounding pitch should reach each point of the glide when the
  // curve does, give or take a few milliseconds, not 20 ms behind.
  const glide: [number, number][] = [[0, 200], [0.6, 200], [0.66, 300], [1.2, 300]];
  const score = scoreOf("ˈa:0.9", { pitch: glide });
  const voice = createVoice(RATE, BODIES.tenor);
  voice.perform(score, 0);
  const tel = new Float32Array(TELEMETRY_SIZE);
  const block = new Float32Array(48);
  let reached = NaN;
  while (voice.time < 0.8 && Number.isNaN(reached)) {
    voice.render(block);
    voice.sense(tel);
    // Telemetry's pose holds the pitch aimed after inertia, before vibrato and jitter.
    if (voice.time > 0.5 && tel[T.pose + 1] >= 250) reached = voice.time;
  }
  // 250 Hz is the glide's musical middle at 0.63 s (straight in log frequency: 200·1.5^0.55).
  const middle = 0.6 + 0.06 * (Math.log(250 / 200) / Math.log(1.5));
  expect(Math.abs(reached - middle)).toBeLessThan(0.006);
});

test("a sung tune is on pitch on every note", () => {
  const notes = [262, 330, 392, 523, 392, 330, 262];
  const tune: [number, number][] = [];
  notes.forEach((hz, i) => tune.push([0.25 + i * 0.4, hz], [0.25 + i * 0.4 + 0.38, hz]));
  const score = scoreOf(notes.map(() => "l:0.08 ˈa:0.32").join(" "), { pitch: tune, body: BODIES.alto });
  const sound = renderScore(score, BODIES.alto, RATE);
  notes.forEach((hz, i) => {
    const middle = 0.25 + i * 0.4 + 0.2;
    const heard = pitchOf(sound, RATE, Math.round((middle - 0.06) * RATE), Math.round((middle + 0.08) * RATE), hz / 1.5, hz * 1.5);
    expect(Math.abs(1200 * Math.log2(heard / hz))).toBeLessThan(20);
  });
});

test("the score's own breath, vibrato and register curves are followed", () => {
  const base = scoreOf("ˈa:1.6", { pitch: 220 });
  const swell: Score = { ...base, pitch: [{ t: 0, v: 220 }], lungs: [{ t: 0.2, v: 0 }, { t: 0.3, v: 0.35 }, { t: 1.7, v: 0.9 }, { t: 1.85, v: 0 }] };
  const sound = renderScore(swell, BODIES.tenor, RATE);
  expect(rms(sound, RATE * 1.4, RATE * 1.6)).toBeGreaterThan(2 * rms(sound, RATE * 0.5, RATE * 0.7));

  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.perform({ ...base, pitch: [{ t: 0, v: 220 }], vibrato: [{ t: 0, v: 40 }], register: [{ t: 0, v: 0 }, { t: 1.8, v: 1 }] }, 0);
  voice.render(new Float32Array(RATE * 1.5));
  voice.sense(tel);
  expect(tel[T.pose + 14]).toBeGreaterThan(30);
  expect(tel[T.pose + 3]).toBeGreaterThan(0.6);
});

test("left to itself the voice breathes: a push for each phrase, a breath in during a long rest", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.perform(scoreOf("ˈl a l a _:0.8 ˈl a l a"), 0);
  const block = new Float32Array(480);
  let inward = 0;
  let lungAtRest = 1;
  let lungInPhrase = 0;
  for (let t = 0; t < 2; t += 0.01) {
    voice.render(block);
    voice.sense(tel);
    inward = Math.min(inward, tel[T.flow]);
    if (t > 0.3 && t < 0.5) lungInPhrase = Math.max(lungInPhrase, tel[T.lung]);
    if (t > 0.85 && t < 1.2) lungAtRest = Math.min(lungAtRest, tel[T.lung]);
  }
  expect(lungInPhrase).toBeGreaterThan(0.4);
  expect(lungAtRest).toBeLessThan(0);
  expect(inward).toBeLessThan(-0.02);
});

test("telemetry names the phone being made", () => {
  const score = scoreOf("ˈm a _:0.3 s i");
  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  voice.perform(score, 0);
  const seen: number[] = [];
  const block = new Float32Array(240);
  for (let t = 0; t < score.length; t += 0.005) {
    voice.render(block);
    voice.sense(tel);
    if (seen[seen.length - 1] !== tel[T.phone]) seen.push(tel[T.phone]);
  }
  expect(seen).toEqual([-1, 0, 1, -1, 2, 3, -1]);
});

test("perform takes a start time, replaces what was scheduled from then on, and hush stops it", () => {
  const voice = createVoice(RATE, BODIES.tenor);
  const tel = new Float32Array(TELEMETRY_SIZE);
  const long = scoreOf("ˈa:3", { pitch: 150 });
  voice.perform(long, 0.5);
  voice.render(new Float32Array(RATE * 0.4));
  voice.sense(tel);
  expect(tel[T.level]).toBeLessThan(0.01);
  voice.render(new Float32Array(RATE * 0.7));
  voice.sense(tel);
  expect(tel[T.f0]).toBeGreaterThan(140);
  // A second score from 1.5 s takes over there; the first plays until then.
  voice.perform(scoreOf("ˈi:1", { pitch: 300 }), 1.5);
  voice.render(new Float32Array(RATE * 0.3));
  voice.sense(tel);
  expect(tel[T.f0]).toBeLessThan(170);
  voice.render(new Float32Array(RATE * 0.7));
  voice.sense(tel);
  expect(tel[T.f0]).toBeGreaterThan(270);
  voice.hush();
  voice.render(new Float32Array(RATE * 0.4));
  voice.sense(tel);
  expect(tel[T.level]).toBeLessThan(0.01);
  expect(tel[T.phone]).toBe(-1);
  // After a score, aim() has the body again.
  voice.aim({ lungs: 0.6, glottis: 0.5, velum: 0, pitch: 200 });
  voice.render(new Float32Array(RATE * 0.4));
  voice.sense(tel);
  expect(tel[T.f0]).toBeGreaterThan(190);
});
