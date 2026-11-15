import { describe, expect, test } from "bun:test";
import { Eyes, lidAt } from "../../src/view/eyes.ts";

/** Ten minutes of a singer's eyes at sixty frames a second: the blinks (start, how long shut) and the largest look aside. */
function watch(seed: number, minutes = 10) {
  const eyes = new Eyes(seed);
  const dt = 1 / 60;
  const blinks: { at: number; long: number }[] = [];
  let shutSince = -1;
  let widest = 0;
  for (let i = 0; i < minutes * 60 * 60; i++) {
    eyes.step(dt, false);
    const t = i * dt;
    if (eyes.closed > 0.5 && shutSince < 0) shutSince = t;
    if (eyes.closed <= 0.5 && shutSince >= 0) {
      blinks.push({ at: shutSince, long: t - shutSince });
      shutSince = -1;
    }
    widest = Math.max(widest, Math.abs(eyes.turn), Math.abs(eyes.raise));
    expect(eyes.closed).toBeGreaterThanOrEqual(0);
    expect(eyes.closed).toBeLessThanOrEqual(1);
  }
  return { blinks, widest };
}

describe("the eyes", () => {
  test("a blink falls fast, rests shut and rises more slowly, about a third of a second in all", () => {
    expect(lidAt(-0.1)).toBe(0);
    expect(lidAt(0.04)).toBeGreaterThan(0.3);
    expect(lidAt(0.09)).toBe(1);
    expect(lidAt(0.2)).toBeGreaterThan(0.3);
    expect(lidAt(0.32)).toBe(0);
  });

  test("they blink as a person at rest does: ten to thirty times a minute, never shut long", () => {
    for (const seed of [0, 1, 2, 3]) {
      const { blinks } = watch(seed);
      const perMinute = blinks.length / 10;
      expect(perMinute).toBeGreaterThan(10);
      expect(perMinute).toBeLessThan(30);
      for (const b of blinks) expect(b.long).toBeLessThan(0.3);
    }
  });

  test("they look about, but not far, and singers do not blink together", () => {
    const a = watch(0, 2);
    const b = watch(1, 2);
    expect(a.widest).toBeGreaterThan(0.05);
    expect(a.widest).toBeLessThan(0.25);
    const together = a.blinks.filter((x) => b.blinks.some((y) => Math.abs(x.at - y.at) < 0.2)).length;
    expect(together).toBeLessThan(a.blinks.length / 3);
  });

  test("with reduced motion they stay open and look ahead", () => {
    const eyes = new Eyes(0);
    for (let i = 0; i < 600; i++) eyes.step(1 / 60, true);
    expect(eyes.closed).toBe(0);
    expect(eyes.turn).toBe(0);
  });
});
