// A directed shot, framed as the view frames it, in the video's three shapes: every head the shot
// is on stays whole inside the room the frame leaves it (crown to its name under the chin, clear
// of the caption and the band below), what it looks at is in the room's middle, and nothing is
// NaN, frame after frame through a whole song and every cut.
import { expect, test } from "bun:test";
import { land, makeEye, see } from "../../src/view/camera.ts";
import { arrange, placePoint } from "../../src/view/cast.ts";
import type { Placement } from "../../src/view/cast.ts";
import { cutBetween, makeTake, planShots, takeAt } from "../../src/view/director.ts";
import { DETAIL, KEEP, UNDER_CHIN, frameShot, frameStep, inRows, lookPoint, shotRoom, shotTurn } from "../../src/view/framing.ts";
import { layout, shapeById } from "../../src/app/film/frames.ts";
import { hymn } from "./hymn.ts";

/** Four singers, child to bass, framed in a shape's room as the Stage look lays it out. */
function stageFor(shape: "16:9" | "9:16" | "1:1") {
  const { width: W, height: H } = shapeById(shape);
  const l = layout({ width: W, height: H, captions: true, instruments: 5, choir: true, titled: false, look: "stage", lyric: true });
  const r = l.room;
  const aspect = Math.max(W - r[0] - r[2], W / 3) / Math.max(H - r[1] - r[3], H / 3);
  const places: Placement[] = arrange([12.5, 14.5, 17, 19].map((tract) => ({ tract, folds: 0.7 })), aspect);
  // what the framing fits: each head's bust as a box, where it stands
  const cloud = new Float32Array(places.length * 8 * 3);
  places.forEach((p, h) => {
    for (let c = 0; c < 8; c++) placePoint(p, c & 1 ? 11.1 : -10.9, c & 2 ? 18 : -12.5, c & 4 ? 7.6 : -7.6, cloud, (h * 8 + c) * 3);
  });
  return { W, H, l, places, cloud };
}

for (const shape of ["16:9", "9:16", "1:1"] as const) {
  test(`${shape}: the shot's heads and their names stay whole inside the room, through a whole song`, () => {
    const { W, H, l, places, cloud } = stageFor(shape);
    const plan = planShots(hymn(), 6);
    const take = makeTake();
    const eye = makeEye();
    eye.width = W;
    eye.height = H;
    const spot = new Float32Array(3);
    const look = new Float32Array(3);
    const at = new Float32Array(3);
    const state = { zoom: 1, shiftX: 0, shiftY: 0 };
    let fit = 1;
    let frameX = 0, frameY = 0;
    let checked = 0, closest = 0;
    const rows = inRows(places);
    // (a wide frame stands them in one row; a tall one, and a square one, in two)
    expect(rows).toBe(shape !== "16:9");
    const dt = 1 / 15;
    for (let t = -0.5; t < 66; t += dt) {
      takeAt(plan, t, take);
      const cut = cutBetween(plan, t - dt, t);
      const turn = shotTurn(take, rows);
      eye.yaw = turn.yaw;
      eye.pitch = turn.pitch;
      // the eye circles the choir's middle, or the shot's heads
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < cloud.length; k += 3) {
        x0 = Math.min(x0, cloud[k]); x1 = Math.max(x1, cloud[k]);
        y0 = Math.min(y0, cloud[k + 1]); y1 = Math.max(y1, cloud[k + 1]);
        z0 = Math.min(z0, cloud[k + 2]); z1 = Math.max(z1, cloud[k + 2]);
      }
      let weight = 0;
      look.fill(0);
      places.forEach((p, h) => {
        if (take.focus[h] <= 0) return;
        lookPoint(p, take.detail, spot);
        for (let c = 0; c < 3; c++) look[c] += spot[c] * take.focus[h];
        weight += take.focus[h];
      });
      const looking = take.toward > 0.001 && weight > 0;
      if (looking) for (let c = 0; c < 3; c++) look[c] /= weight;
      const middle = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      for (let c = 0; c < 3; c++) at[c] = middle[c] + (looking ? (look[c] - middle[c]) * take.pivot * take.toward : 0);
      eye.at.set(at);
      // the framing's fit of the whole choir, settled (the view eases it over half a second)
      for (let round = 0; round < 6; round++) {
        eye.zoom = fit;
        eye.shiftX = frameX;
        eye.shiftY = frameY;
        see(eye, W, H);
        fit = frameStep(eye, cloud, cloud.length / 3, l.room, 1, fit, 1, spot);
        frameX = eye.shiftX;
        frameY = eye.shiftY;
        eye.zoom = fit;
      }
      if (cut) state.shiftX = state.shiftY = 0;
      frameShot(eye, { zoom: fit, shiftX: frameX, shiftY: frameY }, places, take, looking ? look : null, l.room, 1, l.names.tall, state, cut ? 5 : 3);
      for (const v of [...eye.both, state.zoom, state.shiftX, state.shiftY]) expect(Number.isFinite(v)).toBe(true);

      const box = shotRoom(eye, l.room, 1, l.names.tall);
      const slack = 0.5 * box.margin;
      const most = Math.max(...places.map((_, h) => take.focus[h]));
      places.forEach((p, h) => {
        // the heads wholly in the shot: all of them in a wide one, the shot's own in a close one
        const share = 1 - take.toward + take.toward * (most > 0 ? take.focus[h] / most : 1);
        if (share < 0.999) return;
        const points = take.detail > 0.01 ? DETAIL : KEEP.slice(0, 3);
        for (const q of points) {
          placePoint(p, q[0], q[1], q[2], spot);
          land(eye, spot[0], spot[1], spot[2], spot);
          expect(spot[0]).toBeGreaterThan(box.left - slack);
          expect(spot[0]).toBeLessThan(box.left + box.fw + slack);
          expect(spot[1]).toBeGreaterThan(box.top - slack);
          expect(spot[1]).toBeLessThan(box.top + box.fh + slack);
        }
        if (take.detail <= 0.01) {
          // its name, under the chin, above the caption
          placePoint(p, UNDER_CHIN[0], UNDER_CHIN[1], UNDER_CHIN[2], spot);
          land(eye, spot[0], spot[1], spot[2], spot);
          expect(spot[1] + l.names.tall).toBeLessThan(box.top + box.fh + slack);
          expect(spot[0]).toBeGreaterThan(slack);
          expect(spot[0]).toBeLessThan(W - slack);
        }
        checked++;
      });
      // and a close shot is in the room's middle
      if (take.toward > 0.999 && looking) {
        land(eye, look[0], look[1], look[2], spot);
        expect(Math.abs(spot[0] - box.cx)).toBeLessThan(2);
        expect(Math.abs(spot[1] - box.cy)).toBeLessThan(2);
        closest = Math.max(closest, state.zoom);
      }
    }
    expect(checked).toBeGreaterThan(500);
    // the close shots are close: well in from the whole choir
    expect(closest).toBeGreaterThan(shape === "16:9" ? 1.4 : 1.8);
  });
}
