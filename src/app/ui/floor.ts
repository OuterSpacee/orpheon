// The bottom of the page: the word being voiced and its sounds, the current mode's surface, the
// guide line, and the transport.
import { TELEMETRY } from "../../contract.ts";
import type { Score } from "../../contract.ts";
import type { App, ModeParts } from "../app.ts";
import { fileName, renderWav, save } from "../audio/export.ts";
import { captionAt, clock, phoneAt } from "../caption.ts";
import { el } from "../dom.ts";
import { guide } from "../guide.ts";
import type { Guide } from "../guide.ts";
import { SHARED_KEYS, encodeLink } from "../link.ts";
import { jobFor } from "../save.ts";
import { lengthOf } from "../state.ts";
import type { Mode } from "../state.ts";
import { action, slider } from "./controls.ts";
import { sourceLink } from "./top.ts";

export interface Floor {
  root: HTMLElement;
  frame(): void;
}

const SILENCE: Score = { phones: [], pitch: [], length: 0 };

export function mountFloor(app: App, modes: Record<Mode, ModeParts>): Floor {
  const { store, sound } = app;

  // ── the caption: the only large type on the page ──
  const word = el("div.word");
  const phones = el("div.phones", { "aria-hidden": "true" });
  const caption = el("div.caption", { "aria-live": "off" }, word, phones);
  let shownPhones = "";
  let shownNow = -2;

  function drawCaption(): void {
    const playing = store.get().playing;
    // The caption follows the head the stage shows alone, or the first voice.
    const seat = playing && playing.parts[app.shown()] ? app.shown() : 0;
    const telemetry = sound.telemetry(seat);
    const position = seat ? sound.position(seat) : app.position();
    // The sound being made is the one the voice says it is making; failing that, the clock's.
    const reported = telemetry[TELEMETRY.phone];
    const score = playing?.parts[seat].score ?? SILENCE;
    const phone = !playing ? -1 : reported >= 0 ? reported : phoneAt(score, position);
    const c = captionAt(score, playing ? position : -1, phone);
    if (word.textContent !== c.word) word.textContent = c.word;
    const key = c.phones.join(" ");
    if (key !== shownPhones) {
      shownPhones = key;
      shownNow = -2;
      phones.replaceChildren(...c.phones.map((ph) => el("span", {}, ph)));
    }
    if (c.now !== shownNow) {
      shownNow = c.now;
      [...phones.children].forEach((node, i) => {
        node.classList.toggle("now", i === c.now);
        node.classList.toggle("done", c.now >= 0 && i < c.now);
      });
    }
    // The word warms with the sound: its glow is the voice's loudness.
    caption.style.setProperty("--level", playing ? Math.min(1, telemetry[TELEMETRY.level]).toFixed(2) : "0");
  }

  // ── the guide line ──
  const guideText = el("span");
  const guideOffer = el("button.action.offer", { type: "button" });
  const guideLine = el("p.guide.ui", { role: "status" }, guideText, guideOffer);
  let offered: Guide["offer"];
  guideOffer.onclick = () => {
    if (offered?.act === "wake") void sound.wake();
    else if (offered?.act === "reread") modes.speak.retry?.();
  };
  store.on(["audio", "audioWhy", "saving", "remark", "mode", "reading", "lang", "text", "playing", "importing", "importWhy", "song", "imported", "wording"], (s) => {
    const g = guide(s);
    guideText.textContent = g.text;
    guideLine.classList.toggle("trouble", !!g.trouble);
    guideLine.classList.toggle("first", !!g.first);
    offered = g.offer;
    guideOffer.hidden = !g.offer;
    guideOffer.textContent = g.offer?.label ?? "";
  });

  // ── the surfaces: one for each mode, only the current one shown ──
  const surfaces = el("div.surfaces.ui");
  for (const mode in modes) {
    const surface = modes[mode as Mode].surface;
    surface.dataset.mode = mode;
    surfaces.append(surface);
  }

  // ── the transport ──
  const go = el("button.go", { type: "button", onclick: () => modes[store.get().mode].go?.act() });
  const time = el("output.time.num");
  const volume = slider({ label: "Volume", min: 0, max: 1, step: 0.01, value: store.get().volume, show: (v) => String(Math.round(v * 100)), input: (v) => store.set({ volume: v }) });
  const room = slider({ label: "Room", min: 0, max: 1, step: 0.01, value: store.get().room, show: (v) => String(Math.round(v * 100)), input: (v) => store.set({ room: v }) });
  store.on(["volume"], (s) => {
    volume.set(s.volume);
    sound.setVolume(s.volume);
  });
  store.on(["room"], (s) => {
    room.set(s.room);
    sound.setRoom(s.room);
  });

  const saveButton = action("Save as WAV", async () => {
    const s = store.get();
    if (s.saving !== null) return;
    if (!s.last) return app.remark(`Nothing to save yet. ${s.mode === "sing" ? "Sing" : "Speak"} something first, then save it.`);
    store.set({ saving: 0 });
    try {
      const rendered = await renderWav(jobFor(s.last, s.bandLevel), s.room, (done) => store.set({ saving: done }));
      save(rendered.wav, fileName(s.last.title));
      store.set({ saving: null });
      app.remark(`Saved ${clock(rendered.seconds)} of sound, rendered in ${rendered.took.toFixed(1)} seconds.`);
    } catch (error) {
      console.error(error);
      store.set({ saving: null });
      app.remark("The file could not be rendered. Play it once more, then try saving again.");
    }
  });

  const linkButton = action("Copy link", async () => {
    const address = shareAddress();
    try {
      await navigator.clipboard.writeText(address);
      app.remark(store.get().mode === "sing" && store.get().song === "imported" ? "Link copied. It cannot carry your file, only the mode and the body." : "Link copied. It opens this page as it is now.");
    } catch {
      app.remark("The link is in the address bar: copy it from there.");
    }
  });
  const shareAddress = () => `${location.origin}${location.pathname}#${encodeLink(store.get())}`;

  const hide = action("Hide", () => store.set({ alone: true }), { title: "Leave the body alone on the page. Esc brings everything back." });
  // On a phone the side lists and the rest of the transport are sheets, each opened from here.
  const sheetButton = (sheet: "parts" | "controls" | "more", label: string) => {
    const button = el("button.action.sheet-button", { type: "button", "aria-expanded": "false", onclick: () => store.set({ sheet: store.get().sheet === sheet ? "none" : sheet }) }, label);
    store.on(["sheet"], (s) => button.setAttribute("aria-expanded", String(s.sheet === sheet)));
    return button;
  };

  const rest = el(
    "div.transport-rest",
    { "aria-label": "More" },
    el("div.sheet-head", {}, el("span.sheet-name", {}, "More"), el("button.action.sheet-done", { type: "button", onclick: () => store.set({ sheet: "none" }) }, "Done")),
    volume.root,
    room.root,
    saveButton,
    linkButton,
    sourceLink("action.source"),
    hide,
  );
  const transport = el(
    "div.transport.ui",
    {},
    el("div.transport-main", {}, go, time, el("div.sheet-buttons", {}, sheetButton("parts", "Body"), sheetButton("controls", "Controls"), sheetButton("more", "More"))),
    rest,
  );

  // On a phone the sheets rise from just above the transport, however tall it has wrapped to.
  new ResizeObserver(() => document.body.style.setProperty("--transport", `${transport.offsetHeight}px`)).observe(transport);

  store.on(["mode", "playing"], (s) => {
    const mine = modes[s.mode].go;
    go.hidden = !mine;
    go.textContent = s.playing ? "Stop" : (mine?.label ?? "");
    go.classList.toggle("on", !!s.playing);
    saveButton.hidden = s.mode === "touch" || s.mode === "instrument";
    for (const node of surfaces.children) (node as HTMLElement).hidden = (node as HTMLElement).dataset.mode !== s.mode;
  });
  store.on(["saving"], (s) => saveButton.classList.toggle("busy", s.saving !== null));

  // The address bar always holds the link to the page as it is, so it can be copied from there too.
  let writing = 0;
  store.on(SHARED_KEYS, () => {
    clearTimeout(writing);
    writing = window.setTimeout(() => history.replaceState(null, "", `#${encodeLink(store.get())}`), 300);
  });

  let shownTime = "";
  return {
    root: el("main.floor", {}, caption, surfaces, guideLine, transport),
    frame() {
      drawCaption();
      const s = store.get();
      // Beside the main button: the time through a performance, or whatever the mode reads out.
      const held = s.playing ?? (s.mode === s.last?.kind ? s.last : null);
      const readout = modes[s.mode].readout;
      const text = readout ? readout() : held ? `${clock(s.playing ? app.position() : 0)} / ${clock(lengthOf(held))}` : "";
      if (text !== shownTime) time.textContent = shownTime = text;
      // A readout is of the sound itself, so it is warm; a clock is not.
      time.classList.toggle("sound", !!readout);
    },
  };
}
