// The instruments' pictures read what each instrument's sense() reports, and the title wraps.
import { expect, test } from "bun:test";
import { INSTRUMENT_TELEMETRY_SIZE } from "../../src/contract.ts";
import { DRUM, SHAPE, along, heat, kindOf, profileOf } from "../../src/app/film/band.ts";
import { TITLE, titled, wrap } from "../../src/app/film/overlay.ts";

test("each instrument is drawn as its kind", () => {
  expect(kindOf("bass")).toBe("string");
  expect(kindOf("piano")).toBe("string");
  expect(kindOf("flute")).toBe("pipe");
  expect(kindOf("kit")).toBe("drum");
  expect(kindOf("tabla")).toBe("drum");
});

test("a string's picture is the shape it reports, a drum's is its modes round the rim", () => {
  const sense = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
  for (let k = 0; k < SHAPE.points; k++) sense[SHAPE.at + k] = Math.sin((Math.PI * k) / (SHAPE.points - 1));
  const ring = new Float32Array(64);
  const shape = profileOf(sense, "string", ring);
  expect(shape.length).toBe(32);
  expect(along(shape, 0.5, false)).toBeCloseTo(1, 2);
  expect(along(shape, 0, false)).toBeCloseTo(0, 6);

  // One mode, struck just now: one wave around the rim, at full swing.
  const drum = new Float32Array(INSTRUMENT_TELEMETRY_SIZE);
  drum[3] = 0;
  drum[DRUM.modes] = 1;
  drum[DRUM.ratios] = 1;
  const rim = profileOf(drum, "drum", ring);
  expect(Math.max(...rim)).toBeCloseTo(1, 2);
  expect(rim[0]).toBeCloseTo(1, 6);
  expect(rim[32]).toBeCloseTo(-1, 6);
  // Silent: nothing moves.
  expect(Math.max(...profileOf(new Float32Array(INSTRUMENT_TELEMETRY_SIZE), "drum", ring).map(Math.abs))).toBe(0);
  // A short report (the placeholder's loudness alone) draws no shape at all.
  expect(profileOf(new Float32Array(1), "string", ring).length).toBe(0);
});

test("the heat ramp runs dust, warm, white", () => {
  expect(heat(0)).toEqual([201, 214, 255]);
  expect(heat(0.6)).toEqual([255, 213, 138]);
  expect(heat(1)).toEqual([255, 255, 255]);
});

test("a title wraps into the lines it is given, and shrinks when it must", () => {
  const measure = (text: string, size: number) => text.length * size * 0.5;
  const two = wrap(measure, "Twinkle, twinkle, little star", 520, 58, 2);
  expect(two.lines).toEqual(["Twinkle, twinkle,", "little star"]);
  expect(two.size).toBe(58);
  const one = wrap(measure, "Twinkle, twinkle, little star", 520, 58, 1);
  expect(one.lines.length).toBe(1);
  expect(one.size).toBeLessThan(58);
  expect(measure(one.lines[0], one.size)).toBeLessThanOrEqual(520);
});

test("the title is up for its first seconds only", () => {
  expect(titled(-1)).toBe(false);
  expect(titled(0)).toBe(true);
  expect(titled(TITLE.out + 0.01)).toBe(false);
});
