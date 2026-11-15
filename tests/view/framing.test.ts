import { expect, test } from "bun:test";
import { land, makeEye, see } from "../../src/view/camera.ts";
import { MARGIN, frameStep } from "../../src/view/framing.ts";

// The head as a box: back of the skull to the nose tip, bottom of the neck to the crown, ear to ear.
const HEAD = new Float32Array(24);
for (let c = 0; c < 8; c++) HEAD.set([c & 1 ? 11.1 : -10.9, c & 2 ? 18 : -14.5, c & 4 ? 7.6 : -7.6], c * 3);

/** Frame the head in a picture with these insets, and say where its corners land. */
function framed(width: number, height: number, room: number[], yaw = 0, pitch = 0, zoom = 1) {
  const eye = makeEye();
  const spot = new Float32Array(3);
  let fit = 1;
  eye.yaw = yaw;
  eye.pitch = pitch;
  for (let i = 0; i < 12; i++) {
    eye.zoom = fit;
    see(eye, width, height);
    fit = frameStep(eye, HEAD, 8, room, 1, fit, 1, spot);
  }
  eye.zoom = fit * zoom;
  see(eye, width, height);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    land(eye, HEAD[c * 3], HEAD[c * 3 + 1], HEAD[c * 3 + 2], spot);
    x0 = Math.min(x0, spot[0]);
    x1 = Math.max(x1, spot[0]);
    y0 = Math.min(y0, spot[1]);
    y1 = Math.max(y1, spot[1]);
  }
  return { x0, x1, y0, y1, fit };
}

const SIZES: [string, number, number, number[]][] = [
  ["1440×900 between the side lists and above the pad", 1440, 900, [280, 56, 280, 220]],
  ["1280×720 likewise", 1280, 720, [280, 56, 280, 220]],
  ["390×844 above a sheet 40% high", 390, 844, [0, 56, 0, 338]],
  ["no controls at all", 1440, 900, [0, 0, 0, 0]],
];

for (const [name, w, h, [l, t, r, b]] of SIZES) {
  for (const [yaw, pitch] of [[0, 0], [0.8, 0.2], [Math.PI / 2, 0]]) {
    test(`the whole head fits the room, centred and filling it: ${name}, yaw ${yaw.toFixed(1)}`, () => {
      const f = framed(w, h, [l, t, r, b], yaw, pitch);
      const fw = w - l - r;
      const fh = h - t - b;
      const m = MARGIN * Math.min(fw, fh);
      // Inside the room, with its margin.
      expect(f.x0).toBeGreaterThan(l + m - 1);
      expect(f.x1).toBeLessThan(w - r - m + 1);
      expect(f.y0).toBeGreaterThan(t + m - 1);
      expect(f.y1).toBeLessThan(h - b - m + 1);
      // Centred in it.
      expect(Math.abs((f.x0 + f.x1) / 2 - (l + fw / 2))).toBeLessThan(1);
      expect(Math.abs((f.y0 + f.y1) / 2 - (t + fh / 2))).toBeLessThan(1);
      // And as big as it can be: one way or the other it touches the margin.
      const spare = Math.min(fw - 2 * m - (f.x1 - f.x0), fh - 2 * m - (f.y1 - f.y0));
      expect(spare).toBeLessThan(1);
    });
  }
}

test("the user's zoom rides on top of the fit instead of being undone by it", () => {
  const plain = framed(1440, 900, [280, 56, 280, 220]);
  const zoomed = framed(1440, 900, [280, 56, 280, 220], 0, 0, 2);
  expect(zoomed.fit).toBeCloseTo(plain.fit, 3);
  expect(zoomed.x1 - zoomed.x0).toBeGreaterThan((plain.x1 - plain.x0) * 1.9);
});

test("insets wider than the picture leave a third of it rather than nothing", () => {
  const f = framed(800, 600, [500, 0, 500, 0]);
  expect(f.x1 - f.x0).toBeGreaterThan(800 / 3 - 2 * MARGIN * 600 - 2);
  expect(Number.isFinite(f.fit)).toBe(true);
});
