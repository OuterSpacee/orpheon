// The band, named at the bottom edge: one quiet word for each instrument playing, warming with
// its loudness (the first value of its telemetry) as the singers' words do with theirs. Kept
// small on purpose; richer pictures of the instruments belong to the video.
import { INSTRUMENTS } from "../../contract.ts";
import type { App } from "../app.ts";
import { el } from "../dom.ts";

export function mountBandStrip(app: App): { root: HTMLElement; frame(): void } {
  const { store, sound } = app;
  const root = el("div.band-strip.ui", { "aria-hidden": "true" });
  let names: HTMLElement[] = [];

  store.on(["playing"], (s) => {
    const band = s.playing?.band ?? [];
    names = band.map((part) => el("span.band-name", {}, INSTRUMENTS.find((i) => i.id === part.instrument)?.name ?? part.name));
    root.replaceChildren(...names);
    document.body.classList.toggle("banded", band.length > 0);
  });

  return {
    root,
    frame() {
      names.forEach((name, slot) => {
        const level = Math.min(1, sound.instrument(slot)[0] * 1.6);
        name.style.setProperty("--level", level.toFixed(2));
      });
    },
  };
}
