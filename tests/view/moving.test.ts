import { expect, test } from "bun:test";
import { POSE, TELEMETRY as T, TELEMETRY_SIZE } from "../../src/contract.ts";
import { makeMoving } from "../../src/view/moving.ts";

// The page hands frame() one Float32Array, rewritten in place before every call. The view must
// copy what it needs each time: kept by reference, a later rewrite would change what it already
// took, and a test against the last array seen ("is this new?") would never see anything new.
test("the same telemetry array, rewritten in place, keeps moving the body", () => {
  const moving = makeMoving();
  const telemetry = new Float32Array(TELEMETRY_SIZE);
  const settle = () => {
    for (let i = 0; i < 60; i++) moving.step(1 / 60);
  };
  for (let round = 0; round < 3; round++) {
    const jaw = [0.9, 0.1, 0.6][round];
    telemetry[T.time] = round * 0.1;
    telemetry[T.pose + POSE.jaw] = jaw;
    moving.take(telemetry);
    settle();
    expect(moving.now[T.pose + POSE.jaw]).toBeCloseTo(jaw, 3);
  }
});

test("rewriting the array after handing it over changes nothing until it is handed over again", () => {
  const moving = makeMoving();
  const telemetry = new Float32Array(TELEMETRY_SIZE);
  telemetry[T.pose + POSE.jaw] = 0.8;
  moving.take(telemetry);
  telemetry[T.pose + POSE.jaw] = 0.0;
  for (let i = 0; i < 60; i++) moving.step(1 / 60);
  expect(moving.now[T.pose + POSE.jaw]).toBeCloseTo(0.8, 3);
});

test("a longer array is read only as far as the telemetry goes", () => {
  const moving = makeMoving();
  const telemetry = new Float32Array(TELEMETRY_SIZE + 16).fill(Number.NaN);
  telemetry.fill(0, 0, TELEMETRY_SIZE);
  telemetry[T.pose + POSE.lips] = 0.3;
  moving.take(telemetry);
  for (let i = 0; i < 60; i++) moving.step(1 / 60);
  expect(moving.now[T.pose + POSE.lips]).toBeCloseTo(0.3, 3);
});
