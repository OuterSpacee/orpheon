// The page. Builds the stage, the edges and the three modes, and joins them to the sound.
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/layout.css";
import "./styles/modes.css";

import type { App, ModeParts } from "./app.ts";
import { probeVowels, renderWav } from "./audio/export.ts";
import { createSound } from "./audio/sound.ts";
import { bodyAt, sizedBody } from "./bodies.ts";
import { el, typing } from "./dom.ts";
import { decodeLink } from "./link.ts";
import { mountInstrument } from "./modes/instrument.ts";
import { mountSing } from "./modes/sing.ts";
import { mountSpeak } from "./modes/speak.ts";
import { mountTouch } from "./modes/touch.ts";
import { SOLO, jobFor } from "./save.ts";
import { PAD_VOWELS, spotsFrom, vowelProbe } from "./scores.ts";
import { INITIAL, MODES, lengthOf } from "./state.ts";
import type { Mode, State } from "./state.ts";
import { createStore } from "./store.ts";
import { LOOK_KEY, lookKept } from "./look.ts";
import { createPlayer } from "./touch/player.ts";
import type { Player } from "./touch/player.ts";
import { mountBandStrip } from "./ui/band-strip.ts";
import { mountFilm } from "./film/index.ts";
import { mountFloor } from "./ui/floor.ts";
import { mountIdle } from "./ui/idle.ts";
import { mountParts } from "./ui/parts.ts";
import { mountStage } from "./ui/stage.ts";
import { mountTop } from "./ui/top.ts";

const store = createStore<State>({ ...INITIAL, ...lookKept(), ...decodeLink(location.hash) });
// How the body is drawn is this viewer's own taste: kept in this browser, not carried by links.
store.on(["density", "colour"], (s) => {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ density: s.density, colour: s.colour }));
  } catch {
    // (private browsing, or storage refused: the page simply starts as usual next time)
  }
});
const sound = createSound();
let player: Player | null = null;
let fading = 0;
/** The seat each mode shows on the stage when it has one head (Touch's is its player's). */
const modeShown: Partial<Record<Mode, () => number>> = {};

const app: App = {
  store,
  sound,
  remark(text) {
    clearTimeout(fading);
    store.set({ remark: text });
    // Long enough to read: a second and a half, and more for more words.
    fading = window.setTimeout(() => store.set({ remark: "" }), 1500 + text.length * 55);
  },
  begin(performance) {
    player?.quiet();
    // Seat a voice for each part, with its own body, level and place; the first voice is always there.
    performance.parts.forEach((part, seat) => {
      if (seat > 0) return sound.add(seat, sizedBody(part.body, part.size), part.level, part.place);
      sound.setBody(0, sizedBody(part.body, part.size));
      sound.mix(0, part.level, part.place);
    });
    // The band takes its places beside them.
    const band = performance.band ?? [];
    band.forEach((part, slot) => sound.seatInstrument(slot, part.instrument, part.level, part.place));
    sound.setBandLevel(store.get().bandLevel);
    // All in one task, so every part and every instrument starts on the same sample.
    performance.parts.forEach((part, seat) => sound.perform(seat, part.score));
    band.forEach((part, slot) => sound.play(slot, part.notes));
    store.set({ playing: performance, last: performance });
  },
  stop() {
    const playing = store.get().playing;
    if (!playing) return;
    playing.parts.forEach((_, seat) => sound.hush(seat));
    (playing.band ?? []).forEach((_, slot) => sound.hushInstrument(slot));
    store.set({ playing: null });
  },
  position: () => (store.get().playing ? sound.position(0) : -1),
  shown: () => (store.get().mode === "touch" ? (player?.lead ?? 0) : (modeShown[store.get().mode]?.() ?? 0)),
  grab(pose) {
    // Whatever the body is dragged to becomes where the controls stand.
    store.set({ pose: { ...store.get().pose, ...pose } });
    if (store.get().mode === "touch") void sound.wake().then((ok) => ok && grabbing && player?.hold("body", true));
    else sound.aim(0, pose);
    grabbing = true;
  },
  letGo() {
    grabbing = false;
    player?.hold("body", false);
  },
};
let grabbing = false;

// The first voice is always seated; its body follows the body control.
sound.add(0, bodyAt(store.get().body), SOLO.level, SOLO.place);
store.on(["body"], (s) => {
  // A choir's bodies are its arrangement's, not the control's, for as long as it sings.
  if (s.playing && s.playing.parts.length > 1) return;
  for (let seat = 0; seat < 6; seat++) sound.setBody(seat, bodyAt(s.body));
});
sound.onState = (audio) => store.set({ audio, audioWhy: sound.why });
// When a performance is over, by itself or stopped, the extra voices leave and the first is
// again the body the body control describes.
store.on(["playing"], (s, before) => {
  if (s.playing || !before.playing) return;
  before.playing.parts.forEach((_, seat) => seat > 0 && sound.remove(seat));
  (before.playing.band ?? []).forEach((_, slot) => sound.unseatInstrument(slot));
  sound.setBody(0, bodyAt(s.body));
  sound.mix(0, SOLO.level, SOLO.place);
});

player = createPlayer(app);
const stage = mountStage(app);
const modes: Record<Mode, ModeParts> = { touch: mountTouch(app, player), speak: mountSpeak(app), sing: mountSing(app), instrument: mountInstrument(app) };
for (const mode in modes) modeShown[mode as Mode] = modes[mode as Mode].shown;
store.on(["bandLevel"], (s) => sound.setBandLevel(s.bandLevel));
const floor = mountFloor(app, modes);
const idle = mountIdle(app);
const bandStrip = mountBandStrip(app);

const controls = el("aside.controls.edge.ui", { "aria-label": "Controls" });
for (const mode in modes) {
  modes[mode as Mode].controls.dataset.mode = mode;
  controls.append(modes[mode as Mode].controls);
}
store.on(["mode"], (s, before) => {
  // Each mode's controls show with their mode; what belongs to no mode (the sheet's Done) stays.
  for (const node of controls.children) if ((node as HTMLElement).dataset.mode) (node as HTMLElement).hidden = (node as HTMLElement).dataset.mode !== s.mode;
  // Leaving a mode stops what it was playing.
  if (s.mode !== before.mode && s.playing) app.stop();
  if (s.mode !== before.mode && s.sheet !== "none") store.set({ sheet: "none" });
});

const top = mountTop(app);
const parts = mountParts(app, stage);
// Video: its entry at the end of the top bar, its frame over the stage.
const film = mountFilm(app, stage, () => modes[store.get().mode].go?.act());
top.append(film.entry);
// On a phone the lists are sheets: each says what it is and has a way to put it away.
const sheetName = el("span.sheet-name");
store.on(["mode"], (s) => (sheetName.textContent = MODES.find((m) => m.id === s.mode)?.name ?? ""));
const done = () => el("button.action.sheet-done", { type: "button", onclick: () => store.set({ sheet: "none" }) }, "Done");
parts.prepend(el("div.sheet-head", {}, el("span.sheet-name", {}, "Body and view"), done()));
controls.prepend(el("div.sheet-head", {}, sheetName, done()));
// A side list longer than the screen says so: its edge fades where more is hidden.
for (const edge of [parts, controls]) {
  const mark = () => {
    edge.classList.toggle("more-below", edge.scrollTop + edge.clientHeight < edge.scrollHeight - 4);
    edge.classList.toggle("more-above", edge.scrollTop > 4);
  };
  edge.addEventListener("scroll", mark, { passive: true });
  new ResizeObserver(mark).observe(edge);
  new MutationObserver(() => requestAnimationFrame(mark)).observe(edge, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden"] });
}
// Under the words and controls at the bottom (and the top bar), the dark gathers a little, so they read over the dust.
const veil = el("div.veil", { "aria-hidden": "true" });
document.getElementById("app")!.replaceChildren(stage.canvas, veil, stage.singers, top, parts, controls, floor.root, bandStrip.root, stage.whisper, idle.back, film.root);
stage.clear({ top, left: parts, right: controls, bottom: floor.root });

// Ask the engine where it forms each vowel, so the pad marks them where this voice really has
// them. Until the answer comes (or if it never does) the pad shows the places written down.
void probeVowels(PAD_VOWELS.map(vowelProbe))
  .then((poses) => store.set({ vowels: spotsFrom(PAD_VOWELS, poses) }))
  .catch((error) => console.warn("The vowels could not be asked of the engine:", error));

// A link opened in a page that is already open (pasted over the address) is followed too.
window.addEventListener("hashchange", () => store.set(decodeLink(location.hash)));

// Sound may only start from a gesture: the first click or key anywhere wakes the voice.
const wake = (event: Event) => {
  if (event instanceof KeyboardEvent && (event.key === "Tab" || event.key === "Shift" || event.key === "Escape")) return;
  void sound.wake();
};
// iOS Safari counts a tap's end (touchend, click) as the gesture that may start sound, not its start.
window.addEventListener("pointerdown", wake);
window.addEventListener("touchend", wake);
window.addEventListener("click", wake);
window.addEventListener("keydown", wake);

// Space starts and stops a performance, unless the keys are being typed with or a button has them.
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat || typing() || document.activeElement instanceof HTMLButtonElement) return;
  const go = modes[store.get().mode].go;
  if (!go) return;
  event.preventDefault();
  go.act();
});

function frame(): void {
  const s = store.get();
  // A performance is over a moment after its score ends, when the last sound has died away.
  if (s.playing && sound.position(0) > lengthOf(s.playing) + 0.4) store.set({ playing: null });
  modes[s.mode].frame?.();
  floor.frame();
  stage.frame();
  bandStrip.frame();
  idle.frame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For tools/shot.ts and the console: a way to see that sound is really flowing.
Object.assign(window, {
  orpheon: {
    store,
    sound,
    stage,
    /** Loudest sample leaving the page right now, after the limiter. */
    level: () => sound.level(),
    /** Each seat's loudness now (0..1), and each band slot's, for checking who sounds. */
    seats: () => [0, 1, 2, 3, 4, 5].map((seat) => sound.telemetry(seat)[1]),
    band: () => [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => sound.instrument(slot)[0]),
    /** Start whatever the current mode's main button starts. */
    go: () => modes[store.get().mode].go?.act(),
    /** Render the last performance as its WAV would be, without saving it; with `keep`, the file itself too (base64), for tools/listen.ts. */
    render: async (keep = false) => {
      const last = store.get().last;
      if (!last) return null;
      const r = await renderWav(jobFor(last, store.get().bandLevel), store.get().room);
      const wav = keep ? btoa(Array.from(new Uint8Array(await r.wav.arrayBuffer()), (b) => String.fromCharCode(b)).join("")) : undefined;
      return { bytes: r.wav.size, seconds: r.seconds, peak: r.peak, took: r.took, wav };
    },
  },
});
