// Decorations: what each singer wears. Choose a singer (when there are several heads on the
// stage), then a thing for the head, any jewellery, and glasses. "None" undresses everyone, "Dress
// all the same" puts the chosen singer's outfit on all, "Surprise me" deals a new outfit to each.
// The outfits are kept with the singer's place in the line-up, so a singer keeps its clothes when
// it is shown alone; they are kept in this browser and carried in links.
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import { BARE, EYEWEAR, HEADWEAR, JEWELLERY, isBare, itemName, itemsOf, surprise, tidyWardrobe, wear } from "../../view/decor/outfit.ts";
import type { EyewearId, HeadwearId, ItemId, Outfit } from "../../view/decor/outfit.ts";
import type { State } from "../state.ts";
import { castOf } from "./stage.ts";
import { action, choice, section, toggle } from "./controls.ts";

/** The singers that can be dressed now: every head on the stage, by its place in the line-up. */
export function dressable(s: State): { who: number; name: string }[] {
  const seen = new Set<number>();
  return castOf(s).flatMap((x, i) => {
    if (seen.has(x.who)) return [];
    seen.add(x.who);
    return [{ who: x.who, name: x.name || (i === 0 && castOf(s).length === 1 ? "The singer" : `Voice ${i + 1}`) }];
  });
}

/** Everyone in `heads` dressed as `o` (bare outfits are left out). */
export function dressAll(heads: readonly number[], o: Outfit, before: State["outfits"]): State["outfits"] {
  const out: Record<number, Outfit> = { ...before };
  for (const who of heads) out[who] = o;
  return tidyWardrobe(out);
}

/** A new outfit for each of `heads`, the same every time for the same `seed`. */
export function surprised(heads: readonly number[], seed: number, before: State["outfits"]): State["outfits"] {
  const dealt = surprise(seed, heads.length);
  const out: Record<number, Outfit> = { ...before };
  heads.forEach((who, i) => (out[who] = dealt[i]));
  return tidyWardrobe(out);
}

export function mountDress(app: App): HTMLElement {
  const { store } = app;
  /** The singer being dressed, by its place in the line-up. */
  let who = 0;
  /** How many times "Surprise me" was pressed: each press deals the next hand. */
  let surprises = 0;

  const outfitOf = (s: State) => s.outfits[who] ?? BARE;
  const put = (next: Outfit) => {
    const s = store.get();
    store.set({ outfits: tidyWardrobe({ ...s.outfits, [who]: next }) });
  };
  const toggleItem = (id: ItemId) => put(wear(outfitOf(store.get()), id));

  const singers = el("div.dress-who", { role: "group", "aria-label": "Whom to dress" });
  let shownKey = "";
  function showSingers(s: State): void {
    const heads = dressable(s);
    if (!heads.some((h) => h.who === who)) who = heads[0]?.who ?? 0;
    const key = heads.map((h) => `${h.who}:${h.name}`).join("|");
    if (key !== shownKey) {
      shownKey = key;
      singers.replaceChildren(
        ...heads.map((h) =>
          el("button.singer-pick", { type: "button", "data-who": h.who, onclick: () => ((who = h.who), paint(store.get())) }, h.name),
        ),
      );
    }
    singers.hidden = heads.length < 2;
    for (const b of singers.children) b.setAttribute("aria-pressed", String(Number((b as HTMLElement).dataset.who) === who));
  }

  const head = choice<HeadwearId | "none">({
    label: "On the head",
    options: [{ value: "none", label: "Nothing" }, ...HEADWEAR.map((h) => ({ value: h.id, label: h.name }))],
    value: "none",
    pick: (v) => put({ ...outfitOf(store.get()), head: v === "none" ? null : v }),
  });
  const jewels = JEWELLERY.map((j) => ({ id: j.id, t: toggle(j.name, false, () => toggleItem(j.id)) }));
  const eyes = choice<EyewearId | "none">({
    label: "Glasses",
    options: [{ value: "none", label: "None" }, ...EYEWEAR.map((e) => ({ value: e.id, label: e.name }))],
    value: "none",
    pick: (v) => put({ ...outfitOf(store.get()), eyes: v === "none" ? null : v }),
  });

  const heads = () => dressable(store.get()).map((h) => h.who);
  const none = action("None", () => store.set({ outfits: {} }));
  const same = action("Dress all the same", () => {
    const s = store.get();
    store.set({ outfits: dressAll(heads(), outfitOf(s), s.outfits) });
  });
  const surpriseMe = action("Surprise me", () => {
    surprises++;
    const s = store.get();
    store.set({ outfits: surprised(heads(), surprises, s.outfits) });
  });

  const body = section(
    "Decorations",
    false,
    singers,
    head.root,
    el("div.dress-jewels", { role: "group", "aria-labelledby": "dress-jewels" }, el("span.dial-name", { id: "dress-jewels" }, "Jewellery"), el("div.dress-grid", {}, ...jewels.map((j) => j.t.root))),
    eyes.root,
    el("div.dress-actions", {}, none, same, surpriseMe),
  );

  function paint(s: State): void {
    showSingers(s);
    const o = outfitOf(s);
    head.set(o.head ?? "none");
    eyes.set(o.eyes ?? "none");
    for (const j of jewels) j.t.set(o.jewels.includes(j.id));
    // Closed, the title says what the chosen singer has on.
    const on = itemsOf(o).map((id) => (id === "glasses" ? "glasses" : itemName(id).toLowerCase()));
    const dressedHeads = Object.keys(s.outfits).length;
    body.note(on.length ? on.join(", ") : dressedHeads ? `${dressedHeads} dressed` : "none");
    same.hidden = singers.hidden;
    none.disabled = !Object.values(s.outfits).some((x) => !isBare(x));
  }
  store.on(["outfits", "playing", "mode", "voices", "focus"], paint);
  body.root.classList.add("dress");
  return body.root;
}
