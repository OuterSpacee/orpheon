// A score's voice quality reaches the folds while they voice, and only then.
import { expect, test } from "bun:test";
import { POSE, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Score } from "../../src/contract.ts";
import { createVoice } from "../../src/voice/index.ts";

const score = (glottis?: number): Score => ({
  phones: [
    { ph: "a", t: 0.2, d: 0.6 },
    { ph: "s", t: 0.8, d: 0.25 },
    { ph: "a", t: 1.05, d: 0.6 },
  ],
  pitch: [{ t: 0, v: 200 }],
  length: 1.8,
  ...(glottis === undefined ? {} : { glottis: [{ t: 0, v: glottis }] }),
});

/** The settled glottis in the middle of the first vowel and in the middle of the s. */
function glottisAt(s: Score): { vowel: number; s: number } {
  const voice = createVoice(48000);
  voice.perform(s);
  const block = new Float32Array(240);
  const tel = new Float32Array(TELEMETRY_SIZE);
  const seen = { vowel: 0, s: 0 };
  for (let i = 0; i < 1.8 * 200; i++) {
    voice.render(block);
    voice.sense(tel);
    const t = tel[T.time];
    if (Math.abs(t - 0.6) < 0.0026) seen.vowel = tel[T.pose + POSE.glottis];
    if (Math.abs(t - 0.95) < 0.0026) seen.s = tel[T.pose + POSE.glottis];
  }
  return seen;
}

test("a whispered score holds the folds apart through its vowels; an ordinary one voices them", () => {
  const plain = glottisAt(score());
  const whisper = glottisAt(score(0.95));
  const pressed = glottisAt(score(0.25));
  expect(plain.vowel).toBeCloseTo(0.5, 1);
  expect(whisper.vowel).toBeGreaterThan(0.85);
  expect(pressed.vowel).toBeLessThan(0.32);
  // The s opens the folds whatever the quality.
  for (const g of [plain, whisper, pressed]) expect(g.s).toBeGreaterThan(0.6);
});
