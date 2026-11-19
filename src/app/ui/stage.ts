// The stage: the body's canvas, filling the page behind everything, and the quiet label that
// names a part and says what it does. When several voices sing, it is a choir: a head for each
// part, its name under it and the word it is singing.
import { LAYERS, TELEMETRY } from "../../contract.ts";
import type { LayerId, Score } from "../../contract.ts";
import { createAnatomyView } from "../../view/index.ts";
import type { AnatomyViewLab } from "../../view/index.ts";
import { outfitCode } from "../../view/decor/outfit.ts";
import type { App } from "../app.ts";
import { sizedBody } from "../bodies.ts";
import { captionAt } from "../caption.ts";
import { el } from "../dom.ts";
import { clamp, hzToMidi, noteName } from "../notes.ts";
import { LAYER_IDS } from "../state.ts";
import type { State } from "../state.ts";

export interface Stage {
  canvas: HTMLCanvasElement;
  whisper: HTMLElement;
  /** The names under a choir's heads. */
  singers: HTMLElement;
  view: View;
  /** Called on every animation frame: keeps each name under its head. */
  frame(): void;
  /** Name a part beside something on the page (a row of the parts list), or stop with null. */
  point(id: LayerId | null, beside?: DOMRect): void;
  /**
   * Keep the head clear of these elements: it is framed in what is left of the window between
   * them. Measured again whenever any of them changes size or the window does.
   */
  clear(around: { top: HTMLElement; left: HTMLElement; right: HTMLElement; bottom: HTMLElement }): void;
}

type View = Pick<
  AnatomyViewLab,
  "frame" | "frameOf" | "cast" | "spot" | "stats" | "layer" | "solo" | "explode" | "cut" | "look" | "room" | "onGrab" | "onHover" | "onSinger" | "dispose" | "density" | "colour" | "decorations"
>;

/** A view that draws nothing, for a device that cannot draw the body. */
function unseen(): View {
  const nothing = () => {};
  return {
    frame: nothing, frameOf: nothing, cast: nothing, spot: () => null, layer: nothing, solo: nothing, explode: nothing, cut: nothing, density: nothing, colour: nothing, decorations: nothing,
    look: nothing, room: nothing, onGrab: null, onHover: null, onSinger: null, dispose: nothing,
    stats: () => ({ particles: 0, drawn: 0, width: 0, height: 0, frame: 0, density: 0, card: "none", singers: 0 }),
  };
}

/** One head on the stage: what it is called, its body, the seat whose voice it shows, and the score it sings (none in Touch). */
interface Singer {
  name: string;
  body: number;
  /** The airway's length as a multiple of the body's own (a giant, a tiny). */
  size?: number;
  seat: number;
  score: Score | null;
  /** Which singer of the line-up this is, for what it wears (State.outfits): the same singer keeps its clothes whichever head shows it. */
  who: number;
}

/** How long a name stays lit after its voice falls silent, in seconds, as its head does. */
const LINGER = 1.4;
/** The height a singer's name and word take under its chin, in CSS pixels. */
const NAMES_TALL = 48;

/** Who stands on the stage: every part of a performance of several, or Touch's voices, or the one body. (The video asks too.) */
export function castOf(s: State): Singer[] {
  const parts = s.playing?.parts ?? [];
  // One singer of a choir chosen: that voice alone, as the big single head.
  const focused = s.focus >= 0 ? parts.findIndex((part, seat) => (part.line ?? seat) === s.focus) : -1;
  if (parts.length > 1 && focused >= 0) {
    const part = parts[focused];
    return [{ name: "", body: part.body, size: part.size, seat: focused, score: part.score, who: s.focus }];
  }
  if (parts.length > 1) return parts.map((part, seat) => ({ name: part.name ?? `Voice ${seat + 1}`, body: part.body, size: part.size, seat, score: part.score, who: part.line ?? seat }));
  if (parts.length === 1 && parts[0].size) return [{ name: "", body: parts[0].body, size: parts[0].size, seat: 0, score: null, who: 0 }];
  // The Instrument mode is six voices, a head for each, lit as each one sings.
  if (s.mode === "instrument") return Array.from({ length: 6 }, (_, seat) => ({ name: `Voice ${seat + 1}`, body: s.body, size: s.tone.size, seat, score: null, who: seat }));
  const voices = clamp(Math.round(s.voices), 1, 6);
  if (s.mode === "touch" && voices > 1) return Array.from({ length: voices }, (_, seat) => ({ name: `Voice ${seat + 1}`, body: s.body, seat, score: null, who: seat }));
  return [{ name: "", body: s.body, seat: 0, score: null, who: 0 }];
}

/** The room a box takes from the window, or nothing when it is hidden or empty. */
function shown(node: HTMLElement): DOMRect | null {
  // Not offsetParent: it is null for every fixed box, and the edges are all fixed.
  if (node.hidden || node.getClientRects().length === 0) return null;
  const box = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  return box;
}

export function mountStage(app: App): Stage {
  const { store, sound } = app;
  const canvas = el("canvas.stage", {
    role: "img",
    "aria-label": "The body that makes the voice, drawn in light. Drag a part of it to move it; its parts are listed beside it.",
  });
  const name = el("b");
  const does = el("span");
  const whisper = el("div.whisper", { "aria-hidden": "true" }, name, does);
  // If the body cannot be drawn (no WebGL2, or a graphics driver that refuses), the voice and
  // every control still work; the page says so once and carries on with an empty stage.
  let view: View;
  try {
    view = createAnatomyView(canvas);
  } catch (error) {
    console.error(error);
    view = unseen();
    setTimeout(() => app.remark("The body could not be drawn on this device: it needs WebGL 2. The voice still works, and every control is here."), 0);
  }

  // The label trails the pointer while it is over the body.
  let x = 0;
  let y = 0;
  let hovered: LayerId | null = null;
  let hoveredSinger = -1;
  const place = (left: number, top: number) => {
    const wide = whisper.offsetWidth || 240;
    const tall = whisper.offsetHeight || 60;
    const px = Math.min(Math.max(12, left), window.innerWidth - wide - 12);
    const py = Math.min(Math.max(12, top), window.innerHeight - tall - 12);
    whisper.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  };
  function say(id: LayerId | null): void {
    const layer = LAYERS.find((l) => l.id === id);
    whisper.classList.toggle("shown", !!layer);
    if (!layer) return;
    // In a choir the label says whose part it is too.
    const singer = singers[hoveredSinger];
    name.textContent = singer?.name ? `${layer.name} · ${singer.name}` : layer.name;
    does.textContent = layer.does;
  }
  canvas.addEventListener("pointermove", (event) => {
    x = event.clientX;
    y = event.clientY;
    if (hovered) place(x + 18, y + 14);
  });
  canvas.addEventListener("pointerleave", () => {
    hovered = null;
    say(null);
  });
  view.onSinger = (index) => (hoveredSinger = singers.length > 1 ? index : -1);
  view.onHover = (id) => {
    hovered = id;
    say(id);
    if (id) place(x + 18, y + 14);
  };

  // Dragging a part poses the voice. The drag ends when the pointer lifts, wherever that is.
  view.onGrab = (pose) => app.grab(pose);
  window.addEventListener("pointerup", () => app.letGo());
  window.addEventListener("pointercancel", () => app.letGo());

  // ── the cast: one head, or a head for each voice ──
  let singers: Singer[] = [];
  let castKey = "";
  const names = el("div.singers", { "aria-hidden": "true" });
  const labels: { root: HTMLElement; word: HTMLElement; shown: string; quiet: number }[] = [];
  function recast(s: State): void {
    const next = castOf(s);
    singers = next;
    const key = next.map((x) => `${x.name}:${x.body.toFixed(2)}:${(x.size ?? 1).toFixed(2)}:${outfitCode(s.outfits[x.who] ?? { head: null, jewels: [], eyes: null })}`).join("|");
    if (key === castKey) return;
    const sameNames = castKey.split("|").map((k) => k.split(":")[0]).join("|") === next.map((x) => x.name).join("|");
    castKey = key;
    view.cast(next.map((x) => ({ name: x.name, body: sizedBody(x.body, x.size), outfit: s.outfits[x.who] })));
    // Only the clothes changed: the names under the heads stay as they are.
    if (sameNames && labels.length === next.length) return;
    labels.length = 0;
    names.replaceChildren();
    if (next.length < 2) return;
    for (const singer of next) {
      const label = { root: el("div.singer.quiet"), word: el("span.singer-word"), shown: "", quiet: LINGER };
      label.root.append(el("span.singer-name", {}, singer.name), label.word);
      labels.push(label);
      names.append(label.root);
    }
  }
  store.on(["playing", "mode", "voices", "body", "focus", "tone", "outfits"], recast);
  recast(store.get());

  // Each head is shown by its own voice; one head alone follows the voice Touch last played.
  sound.onFrame = () => {
    if (singers.length > 1) singers.forEach((singer, i) => view.frameOf(i, sound.telemetry(singer.seat)));
    else view.frame(sound.telemetry(app.shown()));
  };

  let lastFrame = 0;
  /** Each name under its head, with the word that head is singing now (in Touch, the note). */
  function frame(): void {
    const now = performance.now();
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    names.classList.toggle("shown", labels.length > 1);
    const playing = !!store.get().playing;
    labels.forEach((label, i) => {
      const singer = singers[i];
      const at = view.spot(i);
      if (!singer || !at) return;
      const t = sound.telemetry(singer.seat);
      const level = t[TELEMETRY.level];
      let word = "";
      if (singer.score && playing) {
        const c = captionAt(singer.score, sound.position(singer.seat), t[TELEMETRY.phone]);
        // A part with no words (a bass on "dum", mouth drums) shows the sound it is making.
        word = c.word || (c.now >= 0 ? c.phones[c.now] : "");
      } else if (!singer.score && t[TELEMETRY.f0] > 20 && level > 0.02) word = noteName(hzToMidi(t[TELEMETRY.f0]));
      if (word !== label.shown) label.word.textContent = label.shown = word;
      const sounding = level > 0.015 || t[TELEMETRY.voiced] > 0.15;
      label.quiet = sounding ? 0 : label.quiet + dt;
      label.root.classList.toggle("quiet", label.quiet > LINGER);
      label.root.style.setProperty("--level", Math.min(1, level * 1.5).toFixed(2));
      label.root.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translateX(-50%)`;
    });
  }

  store.on(["hidden"], (s) => LAYER_IDS.forEach((id) => view.layer(id, s.hidden.includes(id) ? 0 : 1)));
  store.on(["solo"], (s) => view.solo(s.solo));
  store.on(["cut"], (s) => view.cut(s.cut));
  store.on(["explode"], (s) => view.explode(s.explode));
  store.on(["density"], (s) => view.density(s.density));
  store.on(["colour"], (s) => view.colour(s.colour));
  store.on(["dressed"], (s) => view.decorations(s.dressed ? 1 : 0));

  return {
    canvas,
    whisper,
    singers: names,
    view,
    frame,
    point(id, beside) {
      if (hovered) return;
      say(id);
      if (id && beside) place(beside.right + 16, beside.top - 4);
    },
    clear(around) {
      // The idle fade and Hide only dim the controls; the head stays where it is rather than
      // swelling into their place and shrinking back when they return.
      let framed = "";
      const measure = () => {
        if (document.body.classList.contains("away") || document.body.classList.contains("alone")) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const gap = 16;
        const top = shown(around.top);
        const left = shown(around.left);
        const right = shown(around.right);
        // What is at the bottom is measured from its highest visible child, not the whole floor,
        // which also spans the empty space between them.
        let floorTop = h;
        for (const child of around.bottom.children) {
          const box = shown(child as HTMLElement);
          if (box && box.height > 0) floorTop = Math.min(floorTop, box.top);
        }
        const phone = w <= 1000;
        // On a phone the side lists are sheets over the floor, so only their tops count.
        const above = top ? top.bottom + gap : gap;
        const below = phone ? Math.min(floorTop, left?.top ?? h, right?.top ?? h) - gap : floorTop - gap;
        // The view frames crown to the foot of the neck; the chin sits about two thirds of the
        // way down. Letting the lowest fifth (the neck) pass under the controls keeps the whole
        // face clear of them and the head a third larger than fitting it whole would. A choir's
        // heads are framed to just under their chins, where their names go: those stay clear
        // of the words and the controls below.
        const reach = singers.length > 1 ? below - NAMES_TALL : Math.min(h - gap, above + (below - above) / 0.8);
        const insets = phone
          ? [gap, above, gap, h - reach]
          : [left ? left.right + gap : gap, above, right ? w - right.left + gap : gap, h - reach];
        const key = insets.map(Math.round).join(",");
        if (key === framed) return;
        framed = key;
        view.room(insets[0], insets[1], insets[2], insets[3]);
      };
      const watch = new ResizeObserver(measure);
      for (const node of [around.top, around.left, around.right, around.bottom, ...around.bottom.children]) watch.observe(node);
      window.addEventListener("resize", measure);
      // A mode or a sheet shows and hides children without resizing anything the observer sees.
      store.on(["mode", "sheet", "playing", "voices", "focus"], () => requestAnimationFrame(measure));
      // Fonts arriving change the measures once more.
      void document.fonts.ready.then(measure);
      measure();
    },
  };
}
