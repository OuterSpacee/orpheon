// The vowels are calibrated, not guessed: each one, rendered by the engine for a man, a woman and
// a child, has its formants where the published measurements put them.
import { expect, test } from "bun:test";
import type { PhoneSymbol, Pose } from "../../src/contract.ts";
import { vowelPose } from "../../src/voice/phones.ts";
import { heardFormants, sung } from "./helpers.ts";
import { FIT_BODIES, VOWEL_TARGETS } from "./published.ts";

const groups = ["man", "woman", "child"] as const;

test("each vowel has its first three formants where they were measured, for a man, a woman and a child", () => {
  let squares = 0;
  let count = 0;
  const misses: string[] = [];
  for (const ph of Object.keys(VOWEL_TARGETS) as PhoneSymbol[]) {
    for (const who of groups) {
      const body = FIT_BODIES[who];
      const want = VOWEL_TARGETS[ph]![who];
      const heard = heardFormants(sung(vowelPose(ph, body)) as Pose, body);
      heard.forEach((hz, i) => {
        const off = (hz - want[i]) / want[i];
        squares += off * off;
        count++;
        // Each formant within 10%: speakers of one group differ from each other by more.
        if (Math.abs(off) > 0.1) misses.push(`${ph} ${who} F${i + 1}: ${hz.toFixed(0)} Hz, published ${want[i]}`);
      });
    }
  }
  expect(misses).toEqual([]);
  // And over all of them, within 3% rms.
  expect(Math.sqrt(squares / count)).toBeLessThan(0.03);
}, 120000);

test("the vowels sit on the vowel chart: close ones have a low F1, front ones a high F2", () => {
  const body = FIT_BODIES.man;
  const f = (ph: PhoneSymbol) => heardFormants(sung(vowelPose(ph, body)) as Pose, body);
  const [i, a, u] = [f("i"), f("a"), f("u")];
  expect(i[0]).toBeLessThan(a[0]);
  expect(u[0]).toBeLessThan(a[0]);
  expect(i[1]).toBeGreaterThan(a[1]);
  expect(a[1]).toBeGreaterThan(u[1]);
});

test("a body between the fitted ones gets formants in between", () => {
  const f = (tract: number) => heardFormants(sung(vowelPose("ə", { tract, folds: 0.5 })) as Pose, { tract, folds: 0.5 });
  const [small, mid, large] = [f(13.5), f(15.5), f(17.5)];
  for (let k = 0; k < 3; k++) {
    expect(mid[k]).toBeLessThan(small[k]);
    expect(mid[k]).toBeGreaterThan(large[k]);
  }
});
