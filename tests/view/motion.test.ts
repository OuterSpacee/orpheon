// The video's motion: still is still; heads nod into syllables and turn toward the one singing;
// the camera closes on a soloist, takes a duet together and the group wide; the same input
// moves the same way every time, and a random motion is made the same from the same number.
import { expect, test } from "bun:test";
import { MOTIONS, Motion, randomMotion } from "../../src/view/motion.ts";
import type { HeadInput } from "../../src/view/motion.ts";

const spec = (id: string) => MOTIONS.find((m) => m.id === id)!.spec;
const heads = (levels: number[]): HeadInput[] => levels.map((level, i) => ({ here: true, x: i * 30 - 45, level, f0: level > 0 ? 220 : 0 }));
const run = (m: Motion, levels: number[], seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) m.step(1 / 30, heads(levels));
};

test("still is still", () => {
  const m = new Motion();
  m.set(spec("still"));
  run(m, [0.6, 0, 0, 0], 4);
  expect(Math.abs(m.camera.yaw) + Math.abs(m.camera.pitch) + Math.abs(m.camera.zoom - 1)).toBeLessThan(1e-9);
  expect(Math.abs(m.heads[0].nod) + Math.abs(m.heads[0].tilt) + Math.abs(m.heads[0].turn)).toBeLessThan(1e-9);
});

test("close-ups: close on a soloist, a duet together, wide for the group", () => {
  const m = new Motion();
  m.set(spec("close"));
  run(m, [0.6, 0, 0, 0], 5);
  expect(m.camera.zoom).toBeGreaterThan(1.5);
  expect(m.camera.toward).toBeGreaterThan(0.8);
  expect(m.camera.focus[0]).toBeGreaterThan(0.95);
  run(m, [0.6, 0.6, 0, 0], 5);
  const duet = m.camera.zoom;
  expect(duet).toBeGreaterThan(1.1);
  expect(Math.abs(m.camera.focus[0] - m.camera.focus[1])).toBeLessThan(0.1);
  run(m, [0.6, 0.6, 0.6, 0.6], 6);
  expect(m.camera.zoom).toBeLessThan(1.05);
  expect(m.camera.toward).toBeLessThan(0.05);
});

test("a head nods into a syllable, and a quiet one turns toward the one singing", () => {
  const m = new Motion();
  m.set(spec("natural"));
  run(m, [0, 0, 0, 0], 1);
  m.step(1 / 30, heads([0.5, 0, 0, 0]));
  let deepest = 0;
  for (let k = 0; k < 10; k++) {
    m.step(1 / 30, heads([0.5, 0, 0, 0]));
    deepest = Math.min(deepest, m.heads[0].nod);
  }
  expect(deepest).toBeLessThan(-0.005);
  run(m, [0.5, 0, 0, 0], 4);
  // the singer stands on the left of head 3, so head 3 turns that way (negative)
  const listening = new Motion();
  listening.set({ ...spec("natural"), seed: 0 });
  run(listening, [0.5, 0, 0, 0], 4);
  const alone = new Motion();
  alone.set({ ...spec("natural"), seed: 0 });
  run(alone, [0, 0, 0, 0], 4);
  expect(listening.heads[3].turn).toBeLessThan(alone.heads[3].turn - 0.05);
});

test("the same input moves the same way; a random motion is the same from the same number", () => {
  const a = new Motion();
  const b = new Motion();
  a.set(spec("orbit"));
  b.set(spec("orbit"));
  run(a, [0.4, 0.2, 0, 0.1], 3);
  run(b, [0.4, 0.2, 0, 0.1], 3);
  expect(a.camera).toEqual(b.camera);
  expect(a.heads).toEqual(b.heads);
  expect(randomMotion(42)).toEqual(randomMotion(42));
  expect(randomMotion(42)).not.toEqual(randomMotion(43));
  const r = randomMotion(7);
  expect(["cinematic", "breathe", "follow", "orbit", "close"]).toContain(r.camera);
  expect(r.strength).toBeGreaterThan(0.3);
});

test("cinematic: a shot is held, not cut on every syllable, and taken once who sings has settled", () => {
  const m = new Motion();
  m.set(spec("cinematic"));
  run(m, [0.6, 0, 0, 0], 6);
  expect(m.camera.focus[0]).toBeGreaterThan(0.9);
  // the alto sings a short moment: the shot does not change
  run(m, [0.6, 0.6, 0, 0], 0.6);
  run(m, [0.6, 0, 0, 0], 0.5);
  expect(m.camera.focus[1]).toBeLessThan(0.05);
  // a duet that lasts: after it has settled, the shot takes both
  run(m, [0.6, 0.6, 0, 0], 6);
  expect(Math.abs(m.camera.focus[0] - m.camera.focus[1])).toBeLessThan(0.1);
  // everyone: wide
  run(m, [0.6, 0.6, 0.6, 0.6], 8);
  expect(m.camera.toward).toBeLessThan(0.05);
});
