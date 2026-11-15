// Where things go in each shape of video: everything inside the frame, nothing on top of anything
// else, and the heads left the most room.
import { expect, test } from "bun:test";
import { SHAPES, layout, letterbox, videoName } from "../../src/app/film/frames.ts";
import type { Box, Layout } from "../../src/app/film/frames.ts";

const inside = (b: Box, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 1e-6 && b.y + b.h <= H + 1e-6;
const apart = (a: Box, b: Box) => a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
/** The rectangle the heads are framed in. */
const heads = (l: Layout): Box => ({ x: l.room[0], y: l.room[1], w: l.width - l.room[0] - l.room[2], h: l.height - l.room[1] - l.room[3] });

const CASES = SHAPES.flatMap((shape) =>
  [false, true].flatMap((choir) =>
    [false, true].flatMap((captions) =>
      [0, 3, 10].flatMap((instruments) =>
        [true, false].map((titled) => ({ shape, ask: { width: shape.width, height: shape.height, choir, captions, instruments, titled } })),
      ),
    ),
  ),
);

test("the four shapes are the sizes asked for", () => {
  expect(SHAPES.map((s) => `${s.id} ${s.width}x${s.height}`)).toEqual(["16:9 1920x1080", "9:16 1080x1920", "1:1 1080x1080", "4:5 1080x1350"]);
  for (const s of SHAPES) {
    const [a, b] = s.id.split(":").map(Number);
    expect(s.width / s.height).toBeCloseTo(a / b, 5);
  }
});

for (const { shape, ask } of CASES) {
  const name = `${shape.id}${ask.choir ? " choir" : ""}${ask.captions ? " captions" : ""} ${ask.instruments} instruments${ask.titled ? " titled" : ""}`;
  test(`${name}: inside the frame and nothing overlaps`, () => {
    const l = layout(ask);
    const W = shape.width;
    const H = shape.height;
    const room = heads(l);
    expect(inside(room, W, H)).toBe(true);
    expect(inside(l.title, W, H)).toBe(true);
    if (l.caption) expect(inside(l.caption, W, H)).toBe(true);
    expect(l.band.length).toBe(ask.instruments);
    l.band.forEach((cell, i) => {
      expect(inside(cell, W, H)).toBe(true);
      l.band.slice(i + 1).forEach((other) => expect(apart(cell, other)).toBe(true));
      if (l.caption) expect(apart(cell, l.caption)).toBe(true);
      expect(apart(cell, l.title)).toBe(true);
    });
    expect(l.caption === null).toBe(!ask.captions);
    if (l.caption) expect(apart(l.caption, l.title)).toBe(true);

    // The heads: never under the title while it is up, unless the title sits in a wide frame's
    // empty corner beside a solo head; never down into the instruments.
    if (ask.titled && !(W > H && !ask.choir)) expect(room.y).toBeGreaterThanOrEqual(l.title.y + l.title.h);
    for (const cell of l.band) expect(room.y + room.h).toBeLessThanOrEqual(cell.y + 1e-6);
    // A choir's names under its chins stay clear of the caption.
    if (ask.choir && l.caption) expect(room.y + room.h + l.names.tall).toBeLessThanOrEqual(l.caption.y + 1e-6);
    // A solo head's neck may pass under the caption, but no more than a fifth of what is framed.
    if (!ask.choir && l.caption) expect(room.y + room.h - l.caption.y).toBeLessThanOrEqual(0.2 * room.h + 1e-6);

    // And they keep a fair share of the frame, even with ten instruments and everything shown.
    expect(room.h).toBeGreaterThan(0.3 * H);
    expect(room.w).toBeGreaterThan(0.8 * W);
  });
}

test("in a wide frame a solo head's title sits in the corner beside it, clear of the middle", () => {
  const l = layout({ width: 1920, height: 1080, choir: false, captions: true, instruments: 3, titled: true });
  expect(l.title.align).toBe("left");
  // The solo head is drawn about as wide as 0.7 of its height, in the middle of the frame.
  const room = heads(l);
  const headWide = 0.7 * room.h;
  expect(l.title.x + l.title.w).toBeLessThan(W2(l) - headWide / 2);
});
const W2 = (l: Layout) => l.width / 2;

test("the title's band is given back to the heads once the title has gone", () => {
  const up = layout({ width: 1080, height: 1920, choir: true, captions: true, instruments: 3, titled: true });
  const gone = layout({ width: 1080, height: 1920, choir: true, captions: true, instruments: 3, titled: false });
  expect(heads(gone).h).toBeGreaterThan(heads(up).h + 150);
});

test("a frame is letterboxed in the space the page leaves, centred", () => {
  const wide = letterbox({ x: 280, y: 60, w: 880, h: 620 }, 1920, 1080);
  for (const [got, want] of [[wide.x, 280], [wide.y, 60 + (620 - 495) / 2], [wide.w, 880], [wide.h, 495]]) expect(got).toBeCloseTo(want, 6);
  const tall = letterbox({ x: 0, y: 0, w: 1000, h: 500 }, 1080, 1920);
  expect(tall.h).toBeCloseTo(500, 6);
  expect(tall.x + tall.w / 2).toBeCloseTo(500, 6);
});

test("a video is named after the song and the frame", () => {
  expect(videoName("Twinkle, twinkle, little star", 1080, 1920, "mp4")).toBe("orpheon-twinkle-twinkle-little-star-1080x1920.mp4");
  expect(videoName("", 1920, 1080, "webm")).toBe("orpheon-voice-1920x1080.webm");
});

// The looks: the Score's timeline, the Band's large pictures, the heads alone; and a song's own
// caption line. Everything inside the frame, nothing on anything else, the heads still seen.
const LOOK_CASES = SHAPES.flatMap((shape) =>
  (["score", "band", "heads", "stage"] as const).flatMap((look) =>
    [false, true].flatMap((lyric) =>
      [0, 4, 8].flatMap((instruments) =>
        [true, false].map((titled) => ({ shape, ask: { width: shape.width, height: shape.height, choir: true, captions: true, instruments, titled, look, lyric } })),
      ),
    ),
  ),
);
for (const { shape, ask } of LOOK_CASES) {
  test(`${shape.id} ${ask.look}${ask.lyric ? " lyric" : ""} ${ask.instruments} instruments${ask.titled ? " titled" : ""}: in its place`, () => {
    const l = layout(ask);
    const W = shape.width;
    const H = shape.height;
    const room = heads(l);
    const boxes: Box[] = [...l.band, ...(l.timeline ? [l.timeline] : []), ...(l.lyric ? [l.lyric] : []), ...(l.caption ? [l.caption] : [])];
    boxes.forEach((b, i) => {
      expect(inside(b, W, H)).toBe(true);
      boxes.slice(i + 1).forEach((other) => expect(apart(b, other)).toBe(true));
      // The heads and their names stay above everything else.
      expect(room.y + room.h + l.names.tall).toBeLessThanOrEqual(b.y + 1e-6);
    });
    expect(l.timeline !== null).toBe(ask.look === "score");
    expect(l.band.length).toBe(ask.look === "heads" ? 0 : ask.instruments);
    expect(l.lyric !== null).toBe(ask.lyric);
    // The Score look carries the words on its timeline, not as the big word.
    if (ask.look === "score") expect(l.caption).toBeNull();
    expect(room.h).toBeGreaterThan(0.2 * H);
  });
}
