// One frame of the video, put together on a 2D canvas the size of the frame: the heads (the view's
// WebGL picture, copied in), then the instruments, each singer's name and word, the big caption
// and the title, in the page's own fonts. The same drawing serves the screen, a live recording
// and a fast one; only where the moment comes from differs.
import { INSTRUMENTS, TELEMETRY } from "../../contract.ts";
import type { InstrumentId, Score } from "../../contract.ts";
import { captionAt, phoneAt } from "../caption.ts";
import type { Caption } from "../caption.ts";
import { hzToMidi, noteName } from "../notes.ts";
import { INK, INK_2, INK_3, SANS, WARM, drawInstrument, mix } from "./band.ts";
import type { Layout, LookId } from "./frames.ts";
import type { SongCaption } from "../state.ts";
import { Timeline } from "./timeline.ts";
import type { Lane, Syllable } from "./timeline.ts";

/** Everything the overlay shows at one instant. */
export interface Moment {
  title: string;
  source: string;
  /** Seconds since the title came up, or -1: no title. */
  since: number;
  /** The tune's word now and its sounds (the first part's), and its loudness. */
  caption: Caption;
  level: number;
  /** A name and a word under each head of a choir; empty for one head. */
  singers: { name: string; word: string; level: number; lit: number }[];
  band: { instrument: InstrumentId; name: string; sense: Float32Array }[];
  /** Seconds into the performance (-1: nothing is performed), every voice for the timeline, and the syllables along it. */
  at: number;
  lanes: Lane[];
  syllables: Syllable[];
  /** A song's own caption line now: its pieces, how many have been sung (the last of them is being sung), what it means, and how present it is (0..1). */
  lyric: { pieces: string[]; sung: number; en: string; alpha: number; line: number } | null;
}

/** The title fades in, stays, and fades out over these seconds. */
export const TITLE = { in: 0.6, out: 4.4, gone: 5.4 } as const;
/** Is the title still up (its band of the frame still kept)? */
export const titled = (since: number): boolean => since >= 0 && since < TITLE.out;

const NOTHING: Caption = { word: "", phones: [], now: -1 };

/** Who is on the stage, as the moment needs them: a name, the seat whose voice it is, its score (none when played live). */
export interface Singer {
  name: string;
  seat: number;
  score: Score | null;
}

/**
 * Turns telemetry into moments, keeping the little each name remembers between frames (how long
 * its voice has been quiet), so a frame drawn at a fixed step is the same every time.
 */
export class Cue {
  private quiet: number[] = [];
  private lit: number[] = [];

  reset(): void {
    this.quiet = [];
    this.lit = [];
  }

  /**
   * `telemetry(seat)` and `position(seat)` (seconds into its score, -1 when not performing) say
   * where each voice is; `instrument(slot)` each instrument's sense().
   */
  moment(
    from: {
      title: string;
      source: string;
      since: number;
      /** The part the big caption follows (the performance's first), and the heads on the stage. */
      lead: { seat: number; score: Score } | null;
      singers: Singer[];
      band: { instrument: InstrumentId; name: string }[];
      captions?: SongCaption[];
    },
    telemetry: (seat: number) => Float32Array,
    position: (seat: number) => number,
    instrument: (slot: number) => Float32Array,
    dt: number,
  ): Moment {
    const lead = from.lead;
    let caption = NOTHING;
    let level = 0;
    if (lead) {
      const t = telemetry(lead.seat);
      const at = position(lead.seat);
      // The sound being made is the one the voice says it is making; failing that, the clock's.
      const reported = t[TELEMETRY.phone];
      const phone = at < 0 ? -1 : reported >= 0 ? reported : phoneAt(lead.score, at);
      caption = captionAt(lead.score, at, phone);
      level = at < 0 ? 0 : Math.min(1, t[TELEMETRY.level]);
    }
    // The song's own lines, or else the lines of its first voice's words.
    const captions = from.captions ?? [];
    const lines = captions.length ? captions : lead ? wordLines(lead.score, from.singers.flatMap((x) => (x.score ? [x.score] : []))) : [];
    const lyric = lyricAt(lines, lead ? position(lead.seat) : -1);
    // A song with its own captions sings its words together: a sounding voice shows the piece of
    // the line being sung, in its own script (its sounds are IPA, which nobody reads in a caption).
    const now = lead ? position(lead.seat) : -1;
    let piece = "";
    for (const c of captions) for (const [t, text] of c.syl) if (now >= 0 && t <= now + 1e-6) piece = text.trim();
    const singers: Moment["singers"] = [];
    if (from.singers.length > 1) {
      from.singers.forEach((singer, i) => {
        const t = telemetry(singer.seat);
        const loud = t[TELEMETRY.level];
        let word = "";
        const at = position(singer.seat);
        if (captions.length) word = at >= 0 && loud > 0.015 ? piece : "";
        else if (singer.score && at >= 0) {
          const c = captionAt(singer.score, at, t[TELEMETRY.phone]);
          // A part with no words (a bass on "dum", mouth drums) shows the sound it is making.
          word = c.word || (c.now >= 0 ? c.phones[c.now] : "");
        } else if (!singer.score && t[TELEMETRY.f0] > 20 && loud > 0.02) word = noteName(hzToMidi(t[TELEMETRY.f0]));
        // A name stays lit a moment after its voice falls silent, as its head does.
        const sounding = loud > 0.015 || t[TELEMETRY.voiced] > 0.15;
        this.quiet[i] = sounding ? 0 : (this.quiet[i] ?? 99) + dt;
        const goal = this.quiet[i] < 1.4 ? 1 : 0;
        const was = this.lit[i] ?? goal;
        this.lit[i] = was + (goal - was) * (1 - Math.exp(-dt / (goal > was ? 0.15 : 0.6)));
        singers.push({ name: singer.name, word, level: Math.min(1, loud * 1.5), lit: this.lit[i] });
      });
    }
    const band = from.band.map((part, slot) => ({ ...part, sense: instrument(slot) }));
    const at = lead ? position(lead.seat) : -1;
    const lanes: Lane[] = from.singers.map((singer) => {
      const t = telemetry(singer.seat);
      return { name: from.singers.length > 1 ? singer.name : "", score: singer.score, f0: t[TELEMETRY.f0], level: Math.min(1, t[TELEMETRY.level]) };
    });
    const syllables: Syllable[] = captions.length
      ? captions.flatMap((c) => c.syl.map(([t, text]) => ({ t, text: text.trim() })))
      : (lead?.score.words ?? []).map((w) => ({ t: w.t, text: w.text }));
    return { title: from.title, source: from.source, since: from.since, caption, level, singers, band, at, lanes, syllables, lyric };
  }
}

/**
 * Caption lines for a song that brings none of its own: the words every voice sings, each once
 * (a staged choir passes the words from voice to voice), a line to each phrase (a breath between
 * words ends one), at most eight words to a line. No translation.
 */
const linesOf = new WeakMap<Score, SongCaption[]>();
export function wordLines(score: Score, others: readonly Score[] = []): SongCaption[] {
  let lines = linesOf.get(score);
  if (lines) return lines;
  lines = [];
  let line: { t: number; text: string }[] = [];
  const all = [score, ...others].flatMap((s) => s.words ?? []).sort((a, b) => a.t - b.t);
  const words = all.filter((w, i) => !all.slice(0, i).some((x) => x.text === w.text && Math.abs(x.t - w.t) < 0.2));
  const close = (end: number) => {
    if (!line.length) return;
    const syl = line.map((w, i): [number, string] => [w.t, i < line.length - 1 ? `${w.text} ` : w.text]);
    lines!.push({ t0: line[0].t, t1: end, text: syl.map(([, s]) => s).join(""), en: "", syl });
    line = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && (w.t - (prev.t + prev.d) > 0.25 || line.length >= 8)) close(w.t);
    line.push({ t: w.t, text: w.text });
  });
  const last = words[words.length - 1];
  close(last ? last.t + last.d : 0);
  linesOf.set(score, lines);
  return lines;
}

/** A song's caption line at `at`: it comes up a little before its first syllable and fades as the next comes. */
export function lyricAt(captions: SongCaption[], at: number): Moment["lyric"] {
  if (at < 0 || !captions.length) return null;
  const EARLY = 0.5;
  let i = -1;
  for (let k = 0; k < captions.length; k++) if (captions[k].t0 - EARLY <= at) i = k;
  if (i < 0) return null;
  const c = captions[i];
  const last = i === captions.length - 1;
  // Past its end it fades over a second, unless the next line has taken its place.
  const alpha = Math.max(0, Math.min(1, (at - (c.t0 - EARLY)) / 0.35, last ? 1 - (at - c.t1 - 1) / 1 : 1));
  if (alpha <= 0) return null;
  let sung = 0;
  for (const [t] of c.syl) if (t <= at + 1e-6) sung++;
  return { pieces: c.syl.map(([, text]) => text), sung, en: c.en, alpha, line: i };
}

/** What to draw besides the heads. */
export interface Showing {
  captions: boolean;
  look: LookId;
}

const rgb = (c: readonly number[], alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha.toFixed(3)})`;
const VOID = "rgba(3,4,9,0.92)";

/** Text with a little of the void gathered behind each letter (as the page's text-shadow does), then its glow. */
function lit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: number, glow = 0, glowColor = "", most = 0): void {
  // A width of Infinity would make the canvas ignore the call: no width is given unless there is one.
  const fill = () => (most > 0 ? ctx.fillText(text, x, y, most) : ctx.fillText(text, x, y));
  ctx.shadowColor = VOID;
  ctx.shadowBlur = halo;
  ctx.fillStyle = color;
  fill();
  if (glow > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glow;
    fill();
  }
  ctx.shadowBlur = 0;
}

/** Break a title into at most `lines` lines that fit `width`, shrinking the type if they cannot. */
export function wrap(measure: (text: string, size: number) => number, text: string, width: number, size: number, lines: number): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let s = size; s > size * 0.55; s *= 0.92) {
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measure(next, s) <= width) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    if (out.length <= lines && out.every((l) => measure(l, s) <= width)) return { lines: out, size: s };
  }
  // Still too long: the last line ends where it must.
  const s = size * 0.55;
  return { lines: words.length ? [text] : [], size: s };
}

/** The picture of one frame. `heads` is the view's canvas, just drawn; `spot(i)` where head i is, in frame pixels. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  heads: CanvasImageSource | null,
  l: Layout,
  m: Moment,
  showing: Showing,
  spot: (index: number) => { x: number; y: number; size: number; light?: number } | null,
  timeline?: { draw: Timeline["draw"] } | null,
  dt = 0,
): void {
  const u = l.unit;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#030409";
  ctx.fillRect(0, 0, l.width, l.height);
  if (heads) ctx.drawImage(heads, 0, 0, l.width, l.height);

  // The instruments along the bottom, the dust of the neck above them sinking into the void, as
  // the page gathers a little of the void behind its words.
  const instruments = showing.look !== "heads";
  if (instruments && l.band.length && m.band.length) {
    const top = Math.min(...l.band.map((b) => b.y));
    const fade = ctx.createLinearGradient(0, top - 40 * u, 0, top + 30 * u);
    fade.addColorStop(0, "rgba(3,4,9,0)");
    fade.addColorStop(1, "rgba(3,4,9,0.82)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, top - 40 * u, l.width, l.height - top + 40 * u);
  }
  if (instruments)
    m.band.forEach((part, i) => {
      const box = l.band[i];
      if (box) drawInstrument(ctx, box, part.instrument, INSTRUMENTS.find((x) => x.id === part.instrument)?.name ?? part.name, part.sense, u, i, l.bandName);
    });

  // Each singer's name under its chin, and the word it is singing; the names stop above the words and the band.
  const floor = Math.min(l.height, ...[l.caption, l.lyric, l.timeline, ...l.band].flatMap((box) => (box ? [box.y] : [])));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  m.singers.forEach((singer, i) => {
    const at = spot(i);
    if (!at) return;
    // A head the camera has left at the frame's edge (or off it) lets its name go, not cut in half.
    const edge = 90 * u;
    const inside = Math.max(0, Math.min(1, Math.min(at.x - edge / 2, l.width - edge / 2 - at.x) / edge, (floor + 6 * u - l.names.tall - at.y) / (20 * u))) * Math.min(1, Math.max(0, ((at.light ?? 1) - 0.25) / 0.6));
    if (inside <= 0.01) return;
    ctx.globalAlpha = inside;
    const y = at.y + 4 * u;
    ctx.font = `300 ${l.names.size}px ${SANS}`;
    ctx.letterSpacing = `${(0.08 * l.names.size).toFixed(1)}px`;
    lit(ctx, singer.name, at.x, y, rgb(mix(INK_3, INK_2, singer.lit)), 10 * u);
    ctx.letterSpacing = "0px";
    if (singer.word) {
      ctx.font = `300 ${l.names.wordSize}px ${SANS}`;
      lit(ctx, singer.word, at.x, y + l.names.size * 1.4, rgb(mix(INK, WARM, singer.level)), 12 * u);
    }
    ctx.globalAlpha = 1;
  });

  // The voices' timeline.
  if (l.timeline && timeline) timeline.draw(ctx, l.timeline, m.lanes, m.at, showing.captions ? m.syllables : [], dt, u);

  // A song's own line, in its own script, lit as it is sung, and what it means under it.
  if (showing.captions && l.lyric && m.lyric) {
    const c = l.lyric;
    const ly = m.lyric;
    ctx.globalAlpha = ly.alpha;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let size = c.size;
    ctx.font = `300 ${size}px ${SANS}`;
    let widths = ly.pieces.map((p) => ctx.measureText(p).width);
    let total = widths.reduce((a, b) => a + b, 0);
    if (total > c.w) {
      size *= c.w / total;
      ctx.font = `300 ${size}px ${SANS}`;
      widths = ly.pieces.map((p) => ctx.measureText(p).width);
      total = widths.reduce((a, b) => a + b, 0);
    }
    let x = c.x + (c.w - total) / 2;
    ly.pieces.forEach((piece, i) => {
      const now = i === ly.sung - 1;
      const done = i < ly.sung - 1;
      const color = now ? rgb(mix(INK, WARM, 0.4 + 0.6 * m.level)) : done ? rgb(INK) : rgb(INK_2);
      lit(ctx, piece, x, c.y, color, 14 * u, now ? (10 + 26 * m.level) * u : 0, rgb(WARM, 0.55));
      x += widths[i];
    });
    ctx.textAlign = "center";
    ctx.font = `300 ${c.enSize}px ${SANS}`;
    ctx.letterSpacing = `${(0.02 * c.enSize).toFixed(1)}px`;
    if (ly.en) lit(ctx, ly.en, c.x + c.w / 2, c.y + size * 1.35 + 10 * u, rgb(INK_2), 10 * u, 0, "", c.w);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }

  // The big caption: the word, warming and glowing with the voice, and its sounds under it.
  if (showing.captions && l.caption && m.caption.word.length + m.caption.phones.length > 0) {
    const c = l.caption;
    const x = c.x + c.w / 2;
    ctx.textBaseline = "top";
    if (m.caption.word) {
      ctx.font = `200 ${c.size}px ${SANS}`;
      ctx.letterSpacing = `${(0.01 * c.size).toFixed(1)}px`;
      lit(ctx, m.caption.word, x, c.y, rgb(mix(INK, WARM, m.level)), 16 * u, (10 + m.level * 38) * u, rgb(WARM, m.level * 0.5), c.w);
      ctx.letterSpacing = "0px";
    }
    const phones = m.caption.phones;
    if (phones.length) {
      ctx.font = `300 ${c.phonesSize}px ${SANS}`;
      const gap = 0.6 * c.phonesSize;
      const widths = phones.map((p) => ctx.measureText(p).width);
      let px = x - (widths.reduce((a, b) => a + b, 0) + gap * (phones.length - 1)) / 2;
      const py = c.y + c.size * 1.12 + 8 * u;
      ctx.textAlign = "left";
      phones.forEach((p, i) => {
        const now = i === m.caption.now;
        const done = m.caption.now >= 0 && i < m.caption.now;
        const color = now ? rgb(WARM) : done ? rgb(INK) : rgb(INK_2);
        lit(ctx, p, px, py, color, 8 * u, now ? 14 * u : 0, rgb(WARM, 0.6));
        px += widths[i] + gap;
      });
      ctx.textAlign = "center";
    }
  }

  // The title and where the song comes from, at the start.
  const t = m.since;
  if (t >= 0 && t < TITLE.gone && m.title) {
    const alpha = t < TITLE.in ? t / TITLE.in : t > TITLE.out ? 1 - (t - TITLE.out) / (TITLE.gone - TITLE.out) : 1;
    const box = l.title;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textBaseline = "top";
    ctx.textAlign = box.align;
    const x = box.align === "left" ? box.x : box.x + box.w / 2;
    const measure = (text: string, size: number) => {
      ctx.font = `200 ${size}px ${SANS}`;
      return ctx.measureText(text).width;
    };
    const fitted = wrap(measure, m.title, box.w, box.size, box.lines);
    ctx.font = `200 ${fitted.size}px ${SANS}`;
    let y = box.y;
    for (const line of fitted.lines) {
      lit(ctx, line, x, y, rgb(INK), 14 * u, 0, "", box.w);
      y += fitted.size * 1.12;
    }
    if (m.source) {
      ctx.font = `300 ${box.sourceSize}px ${SANS}`;
      ctx.letterSpacing = `${(0.04 * box.sourceSize).toFixed(1)}px`;
      lit(ctx, m.source, x, y + 14 * u, rgb(INK_2), 10 * u, 0, "", box.w);
      ctx.letterSpacing = "0px";
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
