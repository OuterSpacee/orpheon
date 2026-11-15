import { expect, test } from "bun:test";
import { LANDMARK, TELEMETRY, TELEMETRY_SIZE, TRACT_POINTS } from "../../src/contract.ts";
import { N, along, centreX, centreY, floorX, floorY, lensArea, makeAirway, restingArea, sectionFor, shapeAirway } from "../../src/view/tract.ts";

const resting = () => Float32Array.from({ length: N }, (_, i) => restingArea(along(i)));
const at = (s: number) => Math.round(s * (N - 1));

test("the centreline runs from the folds to the lips in even steps, about as long as a real airway", () => {
  const a = makeAirway();
  shapeAirway(a, resting(), 0, 0, 0);
  const steps: number[] = [];
  for (let i = 1; i < N; i++) steps.push(Math.hypot(centreX(a, i) - centreX(a, i - 1), centreY(a, i) - centreY(a, i - 1)));
  const length = steps.reduce((x, y) => x + y, 0);
  expect(length).toBeGreaterThan(15.5);
  expect(length).toBeLessThan(18.5);
  const even = length / (N - 1);
  for (const step of steps) {
    expect(step).toBeGreaterThan(even * 0.6);
    expect(step).toBeLessThan(even * 1.4);
  }
});

test("the named places fall where the anatomy has them", () => {
  const a = makeAirway();
  shapeAirway(a, resting(), 0, 0, 0);
  // The folds are at the bottom of the neck part of the tube, the lips are the furthest forward.
  expect(a.roofY[0]).toBeLessThan(-7);
  expect(a.roofX[N - 1]).toBeGreaterThan(8.5);
  // The throat climbs: every point below the velum is higher than the one before.
  for (let i = 1; i <= at(LANDMARK.velum); i++) expect(a.roofY[i]).toBeGreaterThan(a.roofY[i - 1]);
  // The mouth runs forward: every point from the velum on is further forward than the one before.
  for (let i = at(LANDMARK.velum) + 1; i < N; i++) expect(a.roofX[i]).toBeGreaterThan(a.roofX[i - 1]);
  // The top of the palate is the highest point of the roof.
  const top = a.roofY.indexOf(Math.max(...a.roofY));
  expect(Math.abs(along(top) - LANDMARK.palatal)).toBeLessThan(0.05);
  // The ridge sits behind and above the edge of the teeth, which is where the teeth meet (y = 0).
  expect(a.roofX[at(LANDMARK.ridge)]).toBeLessThan(a.roofX[at(LANDMARK.teeth)]);
  expect(a.roofY[at(LANDMARK.ridge)]).toBeGreaterThan(0.5);
  expect(Math.abs(a.roofY[at(LANDMARK.teeth)])).toBeLessThan(0.15);
  // In the throat "across" points forward; in the mouth it points down.
  expect(a.acrossX[at(0.3)]).toBeGreaterThan(0.95);
  expect(a.acrossY[at(LANDMARK.palatal)]).toBeLessThan(-0.95);
});

test("a section drawn for an area has that area", () => {
  const out = { gap: 0, half: 0 };
  for (const s of [0.02, 0.3, 0.6, 0.74, 0.89, 1]) {
    for (const area of [0.05, 0.4, 1.5, 4, 7]) {
      sectionFor(area, s, 0.3, out);
      if (out.gap < 3.59) expect(lensArea(out.gap, out.half)).toBeCloseTo(area, 4);
    }
  }
});

test("a wider tube is a deeper gap, and a closed tube is no gap at all", () => {
  const out = { gap: 0, half: 0 };
  for (const s of [0.05, 0.3, 0.74, 0.89, 1]) {
    let before = -1;
    for (let area = 0; area <= 8; area += 0.25) {
      sectionFor(area, s, 0, out);
      expect(out.gap).toBeGreaterThanOrEqual(before);
      before = out.gap;
    }
    sectionFor(0, s, 0, out);
    expect(out.gap).toBe(0);
  }
});

test("when the tube closes at the ridge, the tongue touches the ridge and nowhere else", () => {
  const area = resting();
  const ridge = at(LANDMARK.ridge);
  area[ridge] = 0;
  const a = makeAirway();
  shapeAirway(a, area, 0, 0, 0);
  expect(Math.hypot(floorX(a, ridge) - a.roofX[ridge], floorY(a, ridge) - a.roofY[ridge])).toBe(0);
  for (let i = 0; i < N; i++) {
    if (i !== ridge) expect(Math.hypot(floorX(a, i) - a.roofX[i], floorY(a, i) - a.roofY[i])).toBeGreaterThan(0.3);
  }
});

test("rounded lips make a narrower, taller opening for the same area, further forward", () => {
  const spread = { gap: 0, half: 0 };
  const round = { gap: 0, half: 0 };
  sectionFor(1, 1, 0, spread);
  sectionFor(1, 1, 1, round);
  expect(round.half).toBeLessThan(spread.half);
  expect(round.gap).toBeGreaterThan(spread.gap);
  const a = makeAirway();
  const b = makeAirway();
  shapeAirway(a, resting(), 0, 0, 0);
  shapeAirway(b, resting(), 0, 0, 1);
  expect(b.roofX[N - 1]).toBeGreaterThan(a.roofX[N - 1] + 0.3);
  expect(b.roofX[at(LANDMARK.palatal)]).toBe(a.roofX[at(LANDMARK.palatal)]);
});

test("a raised larynx lifts the folds and leaves the mouth alone", () => {
  const a = makeAirway();
  const b = makeAirway();
  shapeAirway(a, resting(), 0, 0, 0);
  shapeAirway(b, resting(), 0, 1, 0);
  expect(b.roofY[0]).toBeGreaterThan(a.roofY[0] + 0.4);
  expect(b.roofY[at(LANDMARK.velum)]).toBe(a.roofY[at(LANDMARK.velum)]);
});

test("the telemetry array can be handed over as it is", () => {
  expect(N).toBe(TRACT_POINTS);
  const telemetry = new Float32Array(TELEMETRY_SIZE);
  telemetry.set(resting(), TELEMETRY.area);
  const a = makeAirway();
  const b = makeAirway();
  shapeAirway(a, telemetry, TELEMETRY.area, 0, 0);
  shapeAirway(b, resting(), 0, 0, 0);
  expect(Array.from(a.gap)).toEqual(Array.from(b.gap));
});
