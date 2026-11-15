// The shapes a video can take, its looks, and where everything goes inside one: the heads, the
// song's title, the big caption (or a song's own line and what it means), each singer's name, the
// voices' timeline, and a picture for every instrument. All in the frame's own pixels; no DOM here.

export type ShapeId = "16:9" | "9:16" | "1:1" | "4:5";

export interface Shape {
  id: ShapeId;
  width: number;
  height: number;
  /** What it is for, in a few words. */
  use: string;
}

export const SHAPES: readonly Shape[] = [
  { id: "16:9", width: 1920, height: 1080, use: "Wide, for a screen" },
  { id: "9:16", width: 1080, height: 1920, use: "Tall, for a phone held upright" },
  { id: "1:1", width: 1080, height: 1080, use: "Square" },
  { id: "4:5", width: 1080, height: 1350, use: "Portrait, for a feed" },
];

export const shapeById = (id: string): Shape => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

export type LookId = "stage" | "score" | "band" | "heads" | "scenes";

/** What a video shows besides the heads. */
export const LOOKS: readonly { id: LookId; name: string; use: string }[] = [
  { id: "score", name: "Score", use: "The voices' lines in time, the band below" },
  { id: "stage", name: "Stage", use: "The singers large, the band along the bottom" },
  { id: "band", name: "Band", use: "Every instrument large, its strings at work" },
  { id: "heads", name: "Heads", use: "The singers alone" },
  { id: "scenes", name: "Scenes", use: "The look changes with the song, line by line, dissolving" },
];

export const lookById = (id: string): LookId => LOOKS.find((l) => l.id === id)?.id ?? "score";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Pixels per point: 1 on a frame whose short side is 1080. */
  unit: number;
  /** Where the heads are framed: insets from the left, top, right and bottom edges, for the view's room(). */
  room: [number, number, number, number];
  /** The title and the line under it; `align` says which edge of the box the text holds to. */
  title: Box & { align: "left" | "center"; size: number; sourceSize: number; lines: number };
  /** The word being sung and its sounds under it, centred in the box; null when captions are off. */
  caption: (Box & { size: number; phonesSize: number }) | null;
  /** A song's own caption line, lit syllable by syllable, and what it means under it; null unless the song has them. */
  lyric: (Box & { size: number; enSize: number }) | null;
  /** The voices' melodies in time, moving past a still line (the Score look); null otherwise. */
  timeline: Box | null;
  /** A singer's name and word under its chin (a choir only). */
  names: { size: number; wordSize: number; tall: number };
  /** One box for each instrument's picture, its name along the bottom of the box. */
  band: Box[];
  bandName: number;
}

export interface LayoutAsk {
  width: number;
  height: number;
  /** The big caption is drawn. */
  captions: boolean;
  /** How many instrument pictures are drawn (0 for none). */
  instruments: number;
  /** More than one head: names go under the chins, and the heads fill the width. */
  choir: boolean;
  /** The title is up (the first seconds): where it needs a band across the top, the heads make room. */
  titled: boolean;
  /** What else is shown; left out, the stage. */
  look?: LookId;
  /** The song has its own caption lines (shown instead of the word, when captions are on). */
  lyric?: boolean;
}

/**
 * Where everything goes. A wide frame keeps a solo head in the middle and the title in the empty
 * corner beside it; every other frame (and a choir, which fills the width) puts the title in a
 * band across the top, which the heads give back, easing closer, once the title has gone. The
 * caption sits under the heads and the instruments along the bottom.
 */
export function layout(ask: LayoutAsk): Layout {
  // What is under the heads shrinks, a step at a time, until the heads have a fair share of the frame.
  const least = 0.3 * ask.height;
  let l = layoutAt(ask, 1);
  for (let k = 0.9; k > 0.35 && headsTall(l) < least; k -= 0.06) l = layoutAt(ask, k);
  return l;
}

const headsTall = (l: Layout) => l.height - l.room[1] - l.room[3];

function layoutAt(ask: LayoutAsk, k: number): Layout {
  const { width: W, height: H } = ask;
  const u = Math.min(W, H) / 1080;
  const wide = W / H >= 1.2;
  const tall = H / W >= 1.5;
  // Apps that show tall videos lay their own buttons over the top and bottom: keep clear of them.
  const side = 60 * u;
  const top = (tall ? 120 : 56) * u;
  const bottom = (tall ? 170 : 52) * u;
  const gap = 26 * u;

  const titleSize = (wide ? 58 : 62) * u;
  const sourceSize = 25 * u;
  // Beside a solo head in a wide frame the title has a narrow corner, so it may take three lines;
  // across a choir that is not tall it has the width for one, and too little height to spare for more.
  const lines = tall ? 2 : ask.choir ? 1 : wide ? 3 : 2;
  const titleTall = lines * titleSize * 1.12 + 14 * u + sourceSize * 1.4;
  const corner = wide && !ask.choir;
  const title = corner
    ? { x: side, y: top, w: Math.round(W * 0.26), h: titleTall, align: "left" as const, size: titleSize, sourceSize, lines }
    : { x: side, y: top, w: W - 2 * side, h: titleTall, align: "center" as const, size: titleSize, sourceSize, lines };

  // (Scenes is the page choosing a look as the song goes; laid out alone it is the stage)
  const look = ask.look === "scenes" || !ask.look ? "stage" : ask.look;
  const count = look === "heads" ? 0 : ask.instruments;
  // From the bottom up: the instruments, the timeline, then the caption.
  let floor = H - bottom;
  const band: Box[] = [];
  if (count > 0) {
    // The Band look gives every instrument a large picture, a few to a row; the Score look a row
    // of tall ones; the stage a quiet strip.
    const least = look === "band" ? (wide ? 400 : 300) : look === "score" ? 190 : 180;
    const across = Math.max(1, Math.min(count, Math.floor((W - 2 * side) / (least * u))));
    const rows = Math.ceil(count / across);
    // Several rows are packed closer, so a large band leaves the heads their room.
    const big = look === "band" ? (rows > 1 ? (tall ? 300 : wide ? 210 : 220) : tall ? 360 : wide ? 300 : 280) : look === "score" ? (rows > 1 ? 120 : wide ? 150 : 170) : rows > 1 ? 92 : 110;
    const cellTall = big * u * k;
    const cellWide = Math.min((look === "band" ? 520 : look === "score" ? 330 : 300) * u, (W - 2 * side) / across);
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(across, count - r * across);
      const y = floor - (rows - r) * cellTall;
      const x0 = (W - inRow * cellWide) / 2;
      for (let k = 0; k < inRow; k++) band.push({ x: x0 + k * cellWide, y, w: cellWide, h: cellTall });
    }
    floor -= rows * cellTall + gap;
  }
  let timeline: Box | null = null;
  if (look === "score") {
    const h = (tall ? 380 : wide ? 250 : 280) * u * k;
    timeline = { x: side, y: floor - h, w: W - 2 * side, h };
    floor -= h + gap;
  }
  const clear = floor;
  const wordSize = (tall ? 104 : wide ? 96 : 92) * u;
  const phonesSize = 30 * u;
  let caption: Layout["caption"] = null;
  let lyric: Layout["lyric"] = null;
  if (ask.captions && ask.lyric) {
    const size = (tall ? 62 : wide ? 54 : 50) * u * Math.max(0.75, k);
    const enSize = 27 * u * Math.max(0.8, k);
    const h = size * 1.35 + 10 * u + enSize * 1.35;
    lyric = { x: side, y: floor - h, w: W - 2 * side, h, size, enSize };
    floor -= h + gap;
  } else if (ask.captions && look !== "score") {
    // (The Score look carries the words along its timeline instead.)
    const h = wordSize * 1.12 + 8 * u + phonesSize * 1.3;
    caption = { x: side, y: floor - h, w: W - 2 * side, h, size: wordSize, phonesSize };
    floor -= h + gap;
  }

  // The heads between. A solo head's neck may pass under the caption (a fifth of what is framed
  // is neck, fading out anyway); a choir's names must stay clear, so they get their own room.
  const names = { size: 25 * u, wordSize: 36 * u, tall: 25 * u * 1.4 + 36 * u * 1.35 };
  const above = corner || !ask.titled ? top : title.y + title.h + gap;
  const below = ask.choir ? floor - names.tall : Math.min(clear, above + (floor - above) / 0.8);
  const room: Layout["room"] = [side, above, side, Math.max(0, H - below)];
  return { width: W, height: H, unit: u, room, title, caption, lyric, timeline, names, band, bandName: (look === "band" ? 26 : 22) * u };
}

/** The largest rectangle of the frame's shape that fits inside `space`, centred in it. */
export function letterbox(space: Box, width: number, height: number): Box {
  const k = Math.max(0, Math.min(space.w / width, space.h / height));
  const w = width * k;
  const h = height * k;
  return { x: space.x + (space.w - w) / 2, y: space.y + (space.h - h) / 2, w, h };
}

/** "Twinkle, twinkle, little star" in 9:16 to "orpheon-twinkle-twinkle-little-star-1080x1920.mp4". */
export function videoName(title: string, width: number, height: number, extension: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `orpheon-${slug || "voice"}-${width}x${height}.${extension}`;
}
