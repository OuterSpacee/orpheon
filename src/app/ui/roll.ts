// The piano roll: the tune as lines of light, time running left to right and pitch upward, with
// a playhead and the pitch the voice is really singing drawn over the notes, and under each note
// the syllable sung on it. Read-only.
import type { LyricFit, NoteFit, NoteIn } from "../../lang/index.ts";
import { el } from "../dom.ts";
import { clock } from "../caption.ts";
import { hzToMidi } from "../notes.ts";

/** The longest stretch of a tune shown at once, in seconds; a longer tune scrolls under the playhead. */
const WINDOW = 16;
/** Room under the lowest note for its syllable, in pixels, when there are words. */
const WORDS_ROOM = 15;
/** The least space between two syllables; one that would come closer is left out, so dense notes stay readable. */
const WORD_GAP = 2;

export interface Roll {
  root: HTMLElement;
  /** Show these notes (already in the key and at the pace they will be sung). */
  show(notes: NoteIn[]): void;
  /** Write the words under the notes as the language layer fitted them (fitLyrics), or none. */
  words(fit: LyricFit | null): void;
  /** Draw the playhead at `position` seconds (-1: no playhead) and add the pitch heard now. */
  frame(position: number, hz: number): void;
}

/**
 * Where one note sits in a roll `width` by `height`, showing `span` seconds from `from`, with
 * `foot` pixels kept free under the lowest note.
 */
export function noteBox(note: NoteIn, low: number, high: number, from: number, span: number, width: number, height: number, foot = 6) {
  const x = ((note.t - from) / span) * width;
  const w = Math.max(2, (note.d / span) * width - 2);
  return { x, w, y: pitchY(note.midi, low, high, height, foot) };
}

const pitchY = (midi: number, low: number, high: number, height: number, foot: number): number =>
  height - foot - ((midi - low) / Math.max(1, high - low)) * (height - foot - 6);

export function mountRoll(): Roll {
  const canvas = el("canvas.roll-canvas", { "aria-hidden": "true" });
  const root = el("div.roll", { role: "img" }, canvas);
  const g = canvas.getContext("2d")!;
  let notes: NoteIn[] = [];
  let low = 60;
  let high = 72;
  let total = 1;
  let trail: { t: number; midi: number }[] = [];
  let drawn = "";
  let fitted: NoteFit[] = [];

  // The palette is read from the stylesheet once, so the roll never holds a colour of its own.
  const style = getComputedStyle(document.documentElement);
  const colours: Record<string, string> = {};
  const ink = (name: string) => (colours[name] ||= style.getPropertyValue(name).trim());

  function draw(position: number): void {
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (!width || !height) return;
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, width, height);
    const span = Math.min(total, WINDOW);
    const from = Math.min(Math.max(0, position - span * 0.3), total - span);
    const foot = fitted.length ? WORDS_ROOM : 6;
    g.lineCap = "round";
    g.lineWidth = 3;
    for (const note of notes) {
      if (note.t + note.d < from || note.t > from + span) continue;
      const { x, w, y } = noteBox(note, low, high, from, span, width, height, foot);
      const sung = position >= note.t + note.d;
      const sounding = position >= note.t && !sung;
      // Notes to come are cold dust; the one sounding is warm; those sung have dimmed behind it.
      g.strokeStyle = sounding ? ink("--warm") : sung ? ink("--ink-3") : ink("--ink-2");
      g.shadowColor = ink("--warm");
      g.shadowBlur = sounding ? 10 : 0;
      g.beginPath();
      g.moveTo(x + 1.5, y);
      g.lineTo(x + w - 1.5, y);
      g.stroke();
    }
    g.shadowBlur = 0;
    if (fitted.length) drawWords(position, from, span, width, height);
    // What the voice really sang: its pitch, drawn where it was heard.
    if (trail.length > 1) {
      g.strokeStyle = ink("--warm");
      g.globalAlpha = 0.55;
      g.lineWidth = 1;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const gap = i > 0 && p.t - trail[i - 1].t > 0.08;
        const x = ((p.t - from) / span) * width;
        const y = pitchY(p.midi, low, high, height, foot);
        if (!pen || gap) g.moveTo(x, y);
        else g.lineTo(x, y);
        pen = true;
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    if (position >= 0) {
      const x = ((position - from) / span) * width;
      g.strokeStyle = ink("--warm");
      g.globalAlpha = 0.8;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, height);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  /**
   * The syllables, small, under their notes: a held note gets a thin line carrying on from the
   * syllable before; a split note one syllable on each half; "la" where the words ran out is
   * dimmer. Where they would crowd each other, what the fit changed (a split or shared note) is
   * written first, then the first syllables of words, then the others wherever there is room.
   * Each is cut out of the dust behind it by a rim of the void, so it reads over the body.
   */
  function drawWords(position: number, from: number, span: number, width: number, height: number): void {
    g.font = `300 10.5px ${style.getPropertyValue("--sans")}`;
    g.textBaseline = "top";
    g.lineWidth = 1;
    const labels: { x: number; y: number; text: string; colour: string; rank: number }[] = [];
    // the fit may be a moment older than the notes (a slider moving them): while it is the same
    // tune, each syllable follows its note as it is now
    const same = fitted.length === notes.length;
    fitted.forEach((n, i) => {
      const note = same ? notes[i] : n;
      if (note.t + note.d < from || note.t > from + span) return;
      const { x, w, y } = noteBox(note, low, high, from, span, width, height, WORDS_ROOM);
      const sung = position >= note.t + note.d;
      const sounding = position >= note.t && !sung;
      const colour = sounding ? ink("--warm") : sung || n.kind === "la" ? ink("--ink-3") : ink("--ink-2");
      if (n.kind === "held") {
        g.strokeStyle = colour;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.moveTo(x + 1.5, y + 9.5);
        g.lineTo(x + w - 1.5, y + 9.5);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
      // a split note: the second syllable on its second half
      const rank = n.kind === "split" || n.kind === "merged" ? 0 : n.wordStart ? 1 : 2;
      n.text.forEach((text, k) => labels.push({ x: x + 1 + (k * w) / n.text.length, y: y + 4, text, colour, rank }));
    });
    // labels on different rows (pitches far enough apart) do not crowd each other
    const taken: [number, number, number][] = [];
    const room = (a: number, b: number, y: number) => taken.every(([c, d, z]) => b + WORD_GAP <= c || a >= d + WORD_GAP || Math.abs(y - z) >= 12);
    g.strokeStyle = ink("--void");
    g.lineWidth = 3;
    g.lineJoin = "round";
    for (const rank of [0, 1, 2]) {
      for (const l of labels) {
        if (l.rank !== rank) continue;
        const end = l.x + g.measureText(l.text).width;
        if (!room(l.x, end, l.y)) continue;
        taken.push([l.x, end, l.y]);
        g.fillStyle = l.colour;
        g.strokeText(l.text, l.x, l.y);
        g.fillText(l.text, l.x, l.y);
      }
    }
  }

  new ResizeObserver(() => {
    drawn = "";
    draw(-1);
  }).observe(root);

  return {
    root,
    show(next) {
      notes = next;
      trail = [];
      const pitches = notes.map((n) => n.midi);
      low = Math.min(...pitches, 127) - 2;
      high = Math.max(...pitches, 0) + 2;
      const last = notes[notes.length - 1];
      total = last ? last.t + last.d + 0.4 : 1;
      root.setAttribute(
        "aria-label",
        notes.length ? `The tune: ${notes.length} notes over ${clock(total)}.` : "No tune yet.",
      );
      drawn = "";
      draw(-1);
    },
    words(fit) {
      fitted = fit?.notes ?? [];
      drawn = "";
      draw(-1);
    },
    frame(position, hz) {
      if (position >= 0 && hz > 20) {
        if (trail.length && position < trail[trail.length - 1].t) trail = [];
        trail.push({ t: position, midi: hzToMidi(hz) });
      }
      // Still pictures are not redrawn: only a moving playhead costs anything.
      const key = position < 0 ? "still" : position.toFixed(3);
      if (key === drawn) return;
      drawn = key;
      draw(position);
    },
  };
}
