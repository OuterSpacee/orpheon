// The choir on the stage: where the heads stand, and how a head comes, goes, lights and dims.
import { expect, test } from "bun:test";
import { BODIES, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Body } from "../../src/contract.ts";
import { arrange, headScale, makeSeat, settleSeat } from "../../src/view/cast.ts";
import { makeMoving } from "../../src/view/moving.ts";

const SATB: Body[] = [BODIES.soprano, BODIES.alto, BODIES.tenor, BODIES.bass];
const SIX: Body[] = [...SATB, BODIES.child, BODIES.tenor];

test("one singer stands where the solo head always has", () => {
  expect(arrange([BODIES.bass], 1.4)).toEqual([{ x: 0, y: 0, z: 0, turn: 0, scale: 1 }]);
});

test("a head is the size of its body: a child's smaller than a bass's", () => {
  expect(headScale(BODIES.child)).toBeLessThan(headScale(BODIES.soprano));
  expect(headScale(BODIES.soprano)).toBeLessThan(headScale(BODIES.bass));
  expect(headScale(BODIES.tenor)).toBeCloseTo(1, 6);
});

test("the smaller bodies stand in front, the bigger ones behind and higher", () => {
  const [s, a, t, b] = arrange(SATB, 1.4);
  for (const front of [s, a]) {
    for (const back of [t, b]) {
      expect(front.z).toBeGreaterThan(back.z);
      expect(front.y).toBeLessThan(back.y);
    }
  }
});

test("a wide room stands the choir in one row, a narrow one in rows", () => {
  const wide = arrange(SATB, 3);
  expect(new Set(wide.map((p) => p.z > -10)).size).toBe(1);
  const narrow = arrange(SATB, 0.9);
  expect(narrow.some((p) => p.z < -15)).toBe(true);
});

for (const [name, bodies] of [["four", SATB], ["six", SIX], ["three", SATB.slice(0, 3)], ["two", SATB.slice(0, 2)]] as const) {
  for (const aspect of [0.7, 1.4, 2.5]) {
    test(`${name} singers in a room ${aspect} wide: nobody stands behind anybody, all are centred and turned toward the eye`, () => {
      const placed = arrange(bodies, aspect);
      expect(placed).toHaveLength(bodies.length);
      for (let i = 0; i < placed.length; i++) {
        expect(placed[i].turn).toBeGreaterThan(0.3);
        expect(placed[i].turn).toBeLessThan(1.2);
        for (let j = i + 1; j < placed.length; j++) {
          // Two heads at nearly the same height are at least half a head apart sideways.
          if (Math.abs(placed[i].y - placed[j].y) < 25) expect(Math.abs(placed[i].x - placed[j].x)).toBeGreaterThan(12);
        }
      }
      const xs = placed.map((p) => p.x);
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    });
  }
}

test("pulling the parts apart spreads the singers too", () => {
  const together = arrange(SATB, 3);
  const apart = arrange(SATB, 3, 1);
  // The nearest two heads of a row, sideways.
  const gap = (ps: { x: number; y: number }[]) => {
    let least = Infinity;
    for (const a of ps) for (const b of ps) if (a !== b && Math.abs(a.y - b.y) < 25) least = Math.min(least, Math.abs(a.x - b.x));
    return least;
  };
  expect(gap(apart)).toBeGreaterThan(gap(together) + 30);
});

test("a newcomer rises in over half a second or so; a silent singer dims, and lights when it sings", () => {
  const seat = makeSeat();
  const moving = makeMoving();
  const telemetry = new Float32Array(TELEMETRY_SIZE);
  seat.wanted = true;
  seat.goal = { x: 10, y: 5, z: -3, turn: 0.5, scale: 0.9 };
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      moving.take(telemetry);
      moving.step(1 / 60);
      settleSeat(seat, moving, 1 / 60, false);
    }
  };
  run(0.1);
  expect(seat.here).toBeGreaterThan(0.05);
  expect(seat.here).toBeLessThan(0.5);
  expect(seat.now.y).toBeLessThan(5);
  run(3);
  expect(seat.here).toBeGreaterThan(0.99);
  expect(seat.now.y).toBeCloseTo(5, 1);
  expect(seat.lit).toBeLessThan(0.01);
  // It sings: lit within a fraction of a second.
  telemetry[T.level] = 0.6;
  telemetry[T.voiced] = 1;
  run(0.4);
  expect(seat.lit).toBeGreaterThan(0.9);
  // A breath between phrases does not put it out; a long silence does.
  telemetry[T.level] = 0;
  telemetry[T.voiced] = 0;
  run(0.8);
  expect(seat.lit).toBeGreaterThan(0.9);
  run(4);
  expect(seat.lit).toBeLessThan(0.05);
  // Asked to leave, it fades.
  seat.wanted = false;
  run(2);
  expect(seat.here).toBeLessThan(0.01);
});
