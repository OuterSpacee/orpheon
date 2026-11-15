// The band's controls in Sing: whether it plays, which instruments (the arranger's suggestions
// ticked to begin with, any other added by hand), how loud it is as a whole, and for an imported
// file what each of its own tracks does: sung, played, or left out.
import { INSTRUMENTS } from "../../contract.ts";
import type { InstrumentId } from "../../contract.ts";
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import { otherTracks, playedBy, suggestedFor, suggestedWhy } from "../sing/plan.ts";
import type { Lineup } from "../sing/plan.ts";
import { instrumentName, setupOf, setupPatch, trackUse } from "../sing/setup.ts";
import type { TrackUse } from "../sing/setup.ts";
import { chosenTune } from "../songs.ts";
import { choice, slider, toggle } from "./controls.ts";

const USES: { value: TrackUse; label: string }[] = [
  { value: "sing", label: "sing" },
  { value: "play", label: "play" },
  { value: "out", label: "out" },
];

export function mountBand(app: App): { root: HTMLElement; show(lu: Lineup | null): void; summary(): string } {
  const { store } = app;
  let ids: InstrumentId[] = [];
  let suggestion: InstrumentId[] = [];

  const on = toggle("Band plays", false, (yes) => store.set(setupPatch(store.get(), { band: yes })));
  const ticks = new Map<InstrumentId, HTMLButtonElement>();
  const grid = el("div.instrument-grid", { role: "group", "aria-label": "Instruments" });
  for (const instrument of INSTRUMENTS) {
    const tick = toggle(instrument.name, false, () => {
      const s = store.get();
      const setup = setupOf(s);
      // Ticking one while the band is silent starts the band with that one alone.
      const now = setup.band ? ids : [];
      const next = now.includes(instrument.id) ? now.filter((id) => id !== instrument.id) : [...now, instrument.id];
      // ticked by hand: the band is the person's now, not the arranger's
      store.set(setupPatch(s, { instruments: next, band: next.length > 0 || setup.band, bandWhy: undefined }));
    });
    tick.root.title = instrument.does;
    ticks.set(instrument.id, tick.root);
    grid.append(tick.root);
  }
  const level = slider({
    label: "Band level", min: 0, max: 1, step: 0.01, value: store.get().bandLevel,
    show: (v) => String(Math.round(v * 100)), input: (v) => store.set({ bandLevel: v }),
  });
  store.on(["bandLevel"], (s) => level.set(s.bandLevel));

  // Why the ticked instruments were chosen: the kind of tune the arranger heard.
  const why = el("p.band-why");
  const tracks = el("div.tracks");
  let tracksKey = "";

  function showTracks(): void {
    const s = store.get();
    const source = s.song === "imported" ? chosenTune(s)?.source : undefined;
    const others = source ? otherTracks(source) : [];
    const key = source ? `${source.title}:${others.map((t) => t.index).join(",")}` : "";
    if (key !== tracksKey) {
      tracksKey = key;
      tracks.replaceChildren(
        ...(others.length ? [el("p.dial-name.tracks-title", {}, "The file’s own tracks")] : []),
        ...others.map((track) => {
          const name = `${track.name || `Track ${track.index + 1}`} · ${instrumentName(playedBy(track))}`;
          const pick = choice({
            label: name,
            row: true,
            options: USES,
            value: trackUse(setupOf(s), track.index),
            pick: (use) => {
              const now = store.get();
              const setup = setupOf(now);
              // Singing a track brings the choir in; playing one brings the band.
              store.set(setupPatch(now, { tracks: { ...setup.tracks, [track.index]: use }, ...(use === "sing" ? { choir: true } : use === "play" ? { band: true } : {}) }));
            },
          });
          pick.root.dataset.track = String(track.index);
          return pick.root;
        }),
      );
    }
    const setup = setupOf(s);
    for (const node of tracks.querySelectorAll<HTMLElement>("fieldset[data-track]")) {
      const use = trackUse(setup, Number(node.dataset.track));
      for (const input of node.querySelectorAll("input")) input.checked = input.value === use;
    }
    tracks.hidden = !others.length;
  }

  return {
    root: el("div.band-controls", {}, on.root, why, grid, level.root, tracks),
    show(lu) {
      const s = store.get();
      const setup = setupOf(s);
      // a song with its own band shows its instruments; any other, what the arranger suggests
      suggestion = lu ? suggestedFor(s, lu.notes) : [];
      why.textContent = setup.bandWhy ?? (lu ? suggestedWhy(s, lu.notes) : "");
      ids = setup.instruments ?? suggestion;
      on.set(setup.band);
      // The instruments keep their places (a list that reorders itself reads as "it always
      // ticks the top ones"); the arranger's suggestions are marked where they stand.
      for (const instrument of INSTRUMENTS) {
        const id = instrument.id;
        const tick = ticks.get(id)!;
        tick.setAttribute("aria-pressed", String(setup.band && ids.includes(id)));
        tick.classList.toggle("suggested", suggestion.includes(id));
      }
      showTracks();
    },
    summary() {
      const s = store.get();
      const setup = setupOf(s);
      if (!setup.band) return "off";
      const names = ids.map(instrumentName);
      const source = s.song === "imported" ? chosenTune(s)?.source : undefined;
      const played = source ? otherTracks(source).filter((t) => trackUse(setup, t.index) === "play").length : 0;
      if (played) names.push(played === 1 ? "one track" : `${played} tracks`);
      return names.length ? names.join(", ").toLowerCase() : "nothing ticked";
    },
  };
}
