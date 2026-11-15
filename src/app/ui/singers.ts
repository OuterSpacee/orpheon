// The singers of a choir, listed: each one's name, body and the note it is singing now. Choosing
// one shows that singer alone on the stage, as the big single head; "All" brings the choir back.
// Each can be muted or soloed, and changed: its body, its octave, its level and its place. Level,
// place, mute and solo are heard at once; the body and the octave from the next time it sings.
import { TELEMETRY } from "../../contract.ts";
import type { App } from "../app.ts";
import { BODY_MAX, BODY_NAMES, bodyName } from "../bodies.ts";
import { el } from "../dom.ts";
import { hzToMidi, noteName } from "../notes.ts";
import type { Line } from "../sing/plan.ts";
import type { SeatChange } from "../sing/setup.ts";
import { slider } from "./controls.ts";

interface Row {
  root: HTMLElement;
  pick: HTMLButtonElement;
  body: HTMLElement;
  note: HTMLElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
}

export function mountSingers(app: App): { root: HTMLElement; show(lines: readonly Line[]): void; frame(): void } {
  const { store, sound } = app;
  let lines: readonly Line[] = [];
  let rows: Row[] = [];
  let shownKey = "";

  const change = (i: number, patch: Partial<SeatChange>) => {
    const s = store.get();
    store.set({ changes: { ...s.changes, [i]: { ...s.changes[i], ...patch } } });
  };

  const all = el("button.singer-pick.all", { type: "button", onclick: () => store.set({ focus: -1 }) }, "All");
  const list = el("ul.singer-list", { "aria-label": "Singers" });

  // The dials for the singer chosen.
  const body = slider({ label: "Body", min: 0, max: BODY_MAX, step: 1, value: 0, numeric: false, show: bodyName, input: (v) => change(store.get().focus, { body: v }) });
  const octave = slider({ label: "Octave", min: -2, max: 2, step: 1, value: 0, show: (v) => (v > 0 ? `+${v}` : String(v)), input: (v) => change(store.get().focus, { octave: v }) });
  const level = slider({ label: "Level", min: 0, max: 1, step: 0.01, value: 0.5, show: (v) => String(Math.round(v * 100)), input: (v) => change(store.get().focus, { level: v }) });
  const place = slider({
    label: "Place", min: -1, max: 1, step: 0.05, value: 0, numeric: false,
    show: (v) => (Math.abs(v) < 0.05 ? "middle" : v < 0 ? `${Math.round(-v * 100)}% left` : `${Math.round(v * 100)}% right`),
    input: (v) => change(store.get().focus, { place: v }),
  });
  const dials = el("div.singer-dials", {}, body.root, octave.root, level.root, place.root);

  function build(): void {
    rows = lines.map((line, i) => {
      const pick = el("button.singer-pick", { type: "button", onclick: () => store.set({ focus: store.get().focus === i ? -1 : i }) }, line.name || `Voice ${i + 1}`);
      const row: Row = {
        pick,
        body: el("span.singer-body"),
        note: el("span.singer-note.num"),
        mute: el("button.singer-flag", { type: "button", onclick: () => change(i, { mute: !store.get().changes[i]?.mute }) }, "mute"),
        solo: el("button.singer-flag", { type: "button", onclick: () => change(i, { solo: !store.get().changes[i]?.solo }) }, "solo"),
        root: el("li.singer-row"),
      };
      row.mute.setAttribute("aria-label", `Mute ${line.name || `voice ${i + 1}`}`);
      row.solo.setAttribute("aria-label", `Hear ${line.name || `voice ${i + 1}`} alone`);
      row.root.append(pick, row.body, row.note, row.mute, row.solo);
      return row;
    });
    list.replaceChildren(...rows.map((r) => r.root));
  }

  function paint(): void {
    const s = store.get();
    all.setAttribute("aria-pressed", String(s.focus < 0));
    rows.forEach((row, i) => {
      const c = s.changes[i] ?? {};
      const line = lines[i];
      row.pick.setAttribute("aria-pressed", String(s.focus === i));
      row.root.dataset.focus = String(s.focus === i);
      // A singer no one hears (muted, or another soloed) is dimmed.
      const soloed = Object.values(s.changes).some((x) => x?.solo);
      row.root.classList.toggle("unheard", !!c.mute || (soloed && !c.solo));
      row.mute.setAttribute("aria-pressed", String(!!c.mute));
      row.solo.setAttribute("aria-pressed", String(!!c.solo));
      const b = c.body ?? line.body;
      const shift = c.octave ?? 0;
      const named = Number.isInteger(b) ? BODY_NAMES[b] : bodyName(b);
      // A singer already named for its body ("Bass") is not told twice, unless it was changed.
      const said = (line.name || "").toLowerCase().includes(named) && !shift ? "" : named;
      row.body.textContent = said + (shift ? ` ${shift > 0 ? "+" : ""}${shift} oct` : "");
      row.body.hidden = !row.body.textContent;
    });
    const chosen = s.focus >= 0 ? lines[s.focus] : undefined;
    dials.hidden = !chosen;
    if (chosen) {
      const c = s.changes[s.focus] ?? {};
      body.set(Math.round(c.body ?? chosen.body));
      octave.set(c.octave ?? 0);
      level.set(c.level ?? chosen.level);
      place.set(c.place ?? chosen.place);
    }
  }
  store.on(["changes", "focus"], paint);

  return {
    root: el("div.singers-list", {}, all, list, dials),
    show(next) {
      lines = next;
      const key = next.map((l) => `${l.name}:${l.body}`).join("|");
      if (key !== shownKey) {
        shownKey = key;
        build();
      }
      paint();
    },
    frame() {
      const playing = store.get().playing;
      rows.forEach((row, i) => {
        let text = "";
        if (playing) {
          const seat = playing.parts.findIndex((part, k) => (part.line ?? k) === i);
          const t = seat >= 0 ? sound.telemetry(seat) : null;
          if (t && t[TELEMETRY.f0] > 20 && t[TELEMETRY.level] > 0.02) text = noteName(hzToMidi(t[TELEMETRY.f0]));
        }
        if (row.note.textContent !== text) row.note.textContent = text;
        row.root.classList.toggle("sounding", text !== "");
      });
    },
  };
}
