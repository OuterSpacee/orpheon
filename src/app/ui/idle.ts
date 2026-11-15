// The interface steps back: after a few idle seconds while sound is playing, everything but the
// body (and the word being voiced) fades, and returns when the person moves. "Hide" dismisses
// it by hand until Esc, leaving the body alone on the page.
import { TELEMETRY } from "../../contract.ts";
import type { App } from "../app.ts";
import { el } from "../dom.ts";

/** Seconds without a movement before the controls fade. */
export const IDLE_SECONDS = 4;

/** Pure rule: should the controls be away now? */
export function shouldFade(idleFor: number, sounding: boolean, busy: boolean): boolean {
  return sounding && !busy && idleFor >= IDLE_SECONDS;
}

export function mountIdle(app: App): { back: HTMLElement; frame(): void } {
  const { store, sound } = app;
  let moved = performance.now();
  const stir = () => {
    moved = performance.now();
    if (store.get().away) store.set({ away: false });
  };
  for (const kind of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "focusin"]) {
    window.addEventListener(kind, stir, { passive: true });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const s = store.get();
    if (s.alone) store.set({ alone: false });
    else if (s.sheet !== "none") store.set({ sheet: "none" });
  });

  // The one thing left on the page when it is hidden: a faint dot that brings it back.
  const back = el("button.return", { type: "button", "aria-label": "Bring the controls back", onclick: () => store.set({ alone: false }) });
  store.on(["away", "alone", "sheet", "mode"], (s) => {
    document.body.classList.toggle("away", s.away);
    document.body.classList.toggle("alone", s.alone);
    document.body.dataset.sheet = s.sheet;
    document.body.dataset.mode = s.mode;
  });
  // (After the classes above are on: the dot cannot take the keyboard until it is on the page.)
  store.on(["alone"], (s, before) => {
    if (s.alone && !before.alone) {
      app.remark("Esc, or the dot in the corner, brings everything back.");
      back.focus({ preventScroll: true });
    }
  });

  return {
    back,
    frame() {
      const s = store.get();
      const sounding = s.playing !== null || sound.telemetry(app.shown())[TELEMETRY.level] > 0.02;
      // Never while something needs reading or a list is open.
      const busy = s.saving !== null || s.sheet !== "none" || s.audio !== "awake";
      const fade = shouldFade((performance.now() - moved) / 1000, sounding, busy);
      if (fade !== s.away) store.set({ away: fade });
    },
  };
}
