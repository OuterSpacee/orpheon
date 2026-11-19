// What a singer wears: one thing on the head, any jewellery (one pair of earrings at a time), and
// one pair of glasses. Plain data, so the page can keep it, put it in a link and check it when it
// comes back; the view draws it (items.ts makes each thing as particles).
import { seeded } from "../curve.ts";

export const HEADWEAR = [
  { id: "crown", name: "Crown" },
  { id: "tiara", name: "Tiara" },
  { id: "garland", name: "Marigolds" },
  { id: "turban", name: "Turban" },
  { id: "tophat", name: "Top hat" },
  { id: "beanie", name: "Beanie" },
  { id: "santa", name: "Santa hat" },
  { id: "captain", name: "Captain's cap" },
] as const;

export const JEWELLERY = [
  { id: "studs", name: "Studs", ears: true },
  { id: "hoops", name: "Hoops", ears: true },
  { id: "jhumkas", name: "Jhumkas", ears: true },
  { id: "nath", name: "Nose ring", ears: false },
  { id: "tikka", name: "Maang tikka", ears: false },
  { id: "bindi", name: "Bindi", ears: false },
  { id: "pearls", name: "Pearls", ears: false },
] as const;

export const EYEWEAR = [
  { id: "glasses", name: "Round" },
  { id: "shades", name: "Sunglasses" },
] as const;

export type HeadwearId = (typeof HEADWEAR)[number]["id"];
export type JewelId = (typeof JEWELLERY)[number]["id"];
export type EyewearId = (typeof EYEWEAR)[number]["id"];
export type ItemId = HeadwearId | JewelId | EyewearId;

export interface Outfit {
  head: HeadwearId | null;
  /** In the order of JEWELLERY, at most one pair of earrings. */
  jewels: readonly JewelId[];
  eyes: EyewearId | null;
}

/** The most singers an outfit can be kept for: the most heads on the stage. */
export const WARDROBE_MAX = 6;

/** Each singer's outfit, by its place in the line-up (0 is the solo head); one left out wears nothing. */
export type Wardrobe = Readonly<Record<number, Outfit>>;

export const BARE: Outfit = { head: null, jewels: [], eyes: null };

const isHead = (v: unknown): v is HeadwearId => HEADWEAR.some((h) => h.id === v);
const isJewel = (v: unknown): v is JewelId => JEWELLERY.some((j) => j.id === v);
const isEyes = (v: unknown): v is EyewearId => EYEWEAR.some((e) => e.id === v);
const earring = (id: JewelId) => JEWELLERY.find((j) => j.id === id)!.ears;

export const isBare = (o: Outfit | undefined | null): boolean => !o || (!o.head && !o.jewels.length && !o.eyes);

/** Everything an outfit has on, head first. */
export function itemsOf(o: Outfit | undefined | null): ItemId[] {
  if (!o) return [];
  return [...(o.head ? [o.head] : []), ...o.jewels, ...(o.eyes ? [o.eyes] : [])];
}

/** The name of any item. */
export function itemName(id: ItemId): string {
  return [...HEADWEAR, ...JEWELLERY, ...EYEWEAR].find((x) => x.id === id)?.name ?? id;
}

/** Jewellery in the order of JEWELLERY, each once, and only the first pair of earrings asked for. */
function tidyJewels(list: readonly unknown[]): JewelId[] {
  const asked = list.filter(isJewel);
  const ears = asked.find(earring);
  return JEWELLERY.map((j) => j.id).filter((id) => asked.includes(id) && (!earring(id) || id === ears));
}

/** An outfit from anything (a stored value, a link): what is not a known item is left out. */
export function tidyOutfit(o: unknown): Outfit {
  if (!o || typeof o !== "object") return BARE;
  const { head, jewels, eyes } = o as Record<string, unknown>;
  return { head: isHead(head) ? head : null, jewels: Array.isArray(jewels) ? tidyJewels(jewels) : [], eyes: isEyes(eyes) ? eyes : null };
}

/**
 * Put an item on or take it off: a hat or glasses replace the ones worn (or come off, if they
 * are the ones worn); a pair of earrings replaces the pair worn; other jewellery is added or removed.
 */
export function wear(o: Outfit, id: ItemId): Outfit {
  if (isHead(id)) return { ...o, head: o.head === id ? null : id };
  if (isEyes(id)) return { ...o, eyes: o.eyes === id ? null : id };
  if (o.jewels.includes(id)) return { ...o, jewels: o.jewels.filter((j) => j !== id) };
  const kept = earring(id) ? o.jewels.filter((j) => !earring(j)) : o.jewels;
  return { ...o, jewels: tidyJewels([...kept, id]) };
}

// ── in a link or in storage: short words joined by dots, singers apart by "~" ──

/** "crown.hoops.bindi.glasses"; "" for nothing. */
export function outfitCode(o: Outfit): string {
  return itemsOf(o).join(".");
}

/** The outfit a code describes; unknown words are left out, and only the first hat, glasses and earrings count. */
export function outfitFromCode(code: string): Outfit {
  const words = code.split(".").filter(Boolean);
  return { head: words.find(isHead) ?? null, jewels: tidyJewels(words), eyes: words.find(isEyes) ?? null };
}

/** Every singer's outfit in one short string: "crown.hoops~~santa" dresses the first and the third. */
export function wardrobeCode(w: Wardrobe): string {
  const codes = Array.from({ length: WARDROBE_MAX }, (_, i) => (w[i] ? outfitCode(w[i]) : ""));
  while (codes.length && !codes[codes.length - 1]) codes.pop();
  return codes.join("~");
}

export function wardrobeFromCode(code: string): Wardrobe {
  const out: Record<number, Outfit> = {};
  code.slice(0, 600).split("~").slice(0, WARDROBE_MAX).forEach((c, i) => {
    const o = outfitFromCode(c);
    if (!isBare(o)) out[i] = o;
  });
  return out;
}

/** The same wardrobe with no bare outfits kept, so that two that dress the same look the same. */
export function tidyWardrobe(w: Readonly<Record<number, unknown>>): Wardrobe {
  const out: Record<number, Outfit> = {};
  for (let i = 0; i < WARDROBE_MAX; i++) {
    const o = tidyOutfit(w[i]);
    if (!isBare(o)) out[i] = o;
  }
  return out;
}

/**
 * "Surprise me": an outfit for each of `heads` singers, the same every time for the same `seed`.
 * The hats are dealt like cards, so that a choir has as few twins as it can; each singer gets a
 * little jewellery and now and then glasses, and nobody comes out with nothing on.
 */
export function surprise(seed: number, heads: number): Outfit[] {
  const random = seeded(4801 + Math.round(seed) * 9973);
  const hats = HEADWEAR.map((h) => h.id as HeadwearId);
  for (let i = hats.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [hats[i], hats[j]] = [hats[j], hats[i]];
  }
  const earrings = JEWELLERY.filter((j) => j.ears).map((j) => j.id);
  const others = JEWELLERY.filter((j) => !j.ears).map((j) => j.id);
  return Array.from({ length: Math.max(0, Math.min(WARDROBE_MAX, heads)) }, (_, i) => {
    const head = random() < 0.85 ? hats[i % hats.length] : null;
    const jewels: JewelId[] = [];
    if (random() < 0.6) jewels.push(earrings[Math.floor(random() * earrings.length)]);
    for (const id of others) if (random() < 0.22) jewels.push(id);
    const roll = random();
    const eyes: EyewearId | null = roll < 0.14 ? "glasses" : roll < 0.26 ? "shades" : null;
    const o: Outfit = { head, jewels: tidyJewels(jewels), eyes };
    return isBare(o) ? { ...o, head: hats[i % hats.length] } : o;
  });
}
