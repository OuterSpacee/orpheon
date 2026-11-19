// The left edge: the parts of the body. Click a name to show or hide the part, click its dot to
// see it alone. Last in the list, what the singers wear, shown or hidden as a part is. Below
// them, how the body is seen: cut open, pulled apart, how thick its cloud is and how colourful;
// and what each singer wears (dress.ts).
import { LAYERS } from "../../contract.ts";
import type { LayerId } from "../../contract.ts";
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import { slider } from "./controls.ts";
import { mountDress } from "./dress.ts";
import type { Stage } from "./stage.ts";

export function mountParts(app: App, stage: Stage): HTMLElement {
  const { store } = app;
  const rows = new Map<LayerId, { row: HTMLElement; dot: HTMLButtonElement; name: HTMLButtonElement }>();
  const list = el("ul.part-list", { "aria-label": "Parts of the body" });

  for (const layer of LAYERS) {
    const id = layer.id as LayerId;
    const dot = el("button.part-dot", {
      type: "button",
      onclick: () => store.set({ solo: store.get().solo === id ? null : id }),
    });
    const name = el(
      "button.part-name",
      {
        type: "button",
        "aria-description": layer.does,
        onclick: () => {
          const hidden = store.get().hidden;
          store.set({ hidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] });
        },
      },
      layer.name,
    );
    const row = el("li.part", {}, dot, name);
    // Hovering or focusing a row says what the part does, as hovering the body does.
    const tell = () => stage.point(id, row.getBoundingClientRect());
    const hush = () => stage.point(null);
    row.addEventListener("pointerenter", tell);
    row.addEventListener("pointerleave", hush);
    row.addEventListener("focusin", tell);
    row.addEventListener("focusout", hush);
    rows.set(id, { row, dot, name });
    list.append(row);
  }

  // What the singers wear: not a part of the body, but shown and hidden as one. Its dot only marks it.
  const dressName = el("button.part-name", { type: "button", "aria-description": "What the singers wear: hats, jewellery, glasses.", onclick: () => store.set({ dressed: !store.get().dressed }) }, "Decorations");
  const dressRow = el("li.part.part-worn", {}, el("span.part-dot", { "aria-hidden": "true" }), dressName);
  list.append(dressRow);
  store.on(["dressed", "solo"], (s) => {
    dressRow.dataset.shown = String(s.dressed);
    dressRow.dataset.ghost = String(s.solo !== null && s.solo !== "skin");
    dressName.setAttribute("aria-pressed", String(s.dressed));
  });

  store.on(["hidden", "solo"], (s) => {
    for (const layer of LAYERS) {
      const id = layer.id as LayerId;
      const { row, dot, name } = rows.get(id)!;
      const shown = !s.hidden.includes(id);
      const alone = s.solo === id;
      row.dataset.shown = String(shown);
      row.dataset.solo = String(alone);
      row.dataset.ghost = String(s.solo !== null && !alone);
      name.setAttribute("aria-pressed", String(shown));
      dot.setAttribute("aria-pressed", String(alone));
      dot.setAttribute("aria-label", alone ? `Bring the rest back beside the ${layer.name.toLowerCase()}` : `Show the ${layer.name.toLowerCase()} alone`);
    }
  });

  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const cut = slider({ label: "Cut open", min: 0, max: 1, step: 0.01, value: store.get().cut, show: percent, input: (v) => store.set({ cut: v }) });
  const apart = slider({ label: "Pull apart", min: 0, max: 1, step: 0.01, value: store.get().explode, show: percent, input: (v) => store.set({ explode: v }) });
  const density = slider({ label: "Density", min: 0.1, max: 1, step: 0.01, value: store.get().density, show: percent, ends: ["airy", "dense"], input: (v) => store.set({ density: v }) });
  const colour = slider({ label: "Colour", min: 0, max: 1, step: 0.01, value: store.get().colour, show: percent, ends: ["starlight", "full colour"], input: (v) => store.set({ colour: v }) });
  store.on(["cut"], (s) => cut.set(s.cut));
  store.on(["explode"], (s) => apart.set(s.explode));
  store.on(["density"], (s) => density.set(s.density));
  store.on(["colour"], (s) => colour.set(s.colour));

  return el(
    "aside.parts.edge.ui",
    { "aria-label": "The body" },
    el("h2.edge-title", {}, "Body"),
    list,
    el("h2.edge-title", {}, "View"),
    el("div.part-dials", {}, cut.root, apart.root, density.root, colour.root),
    mountDress(app),
  );
}
