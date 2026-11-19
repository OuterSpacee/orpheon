// What the singers wear: the outfit model (wearing and taking off, its short written form,
// "Surprise me"), and where each thing sits on the head: hats above the eyes and on the skull,
// earrings at the lobes, glasses in front of the eyes, for every body's head.
import { describe, expect, test } from "bun:test";
import { BODIES } from "../../src/contract.ts";
import { headScale, placePoint } from "../../src/view/cast.ts";
import { FLOATS } from "../../src/view/dust.ts";
import { EYE, pillow, skin } from "../../src/view/head.ts";
import { LOBE, clearance } from "../../src/view/decor/fit.ts";
import { BANDS } from "../../src/view/decor/hats.ts";
import { ITEM_STYLE, coverOf, makeItem } from "../../src/view/decor/items.ts";
import {
  BARE, EYEWEAR, HEADWEAR, JEWELLERY, isBare, itemsOf, outfitCode, outfitFromCode, surprise, tidyOutfit, tidyWardrobe, wardrobeCode, wardrobeFromCode, wear,
} from "../../src/view/decor/outfit.ts";
import type { ItemId, Outfit } from "../../src/view/decor/outfit.ts";

const ALL: ItemId[] = [...HEADWEAR, ...JEWELLERY, ...EYEWEAR].map((x) => x.id);

/** The particles of an item as [x, y, z] in the head's own cm. */
function points(id: ItemId): [number, number, number][] {
  const p = makeItem(id);
  return Array.from({ length: p.count }, (_, i) => [p.floats[i * FLOATS], p.floats[i * FLOATS + 1], p.floats[i * FLOATS + 2]] as [number, number, number]);
}
const made = new Map<ItemId, [number, number, number][]>();
const of = (id: ItemId) => made.get(id) ?? (made.set(id, points(id)), made.get(id)!);

describe("an outfit", () => {
  test("takes one thing on the head and one pair of glasses: a new one replaces the old, the same one comes off", () => {
    let o = wear(BARE, "crown");
    o = wear(o, "tophat");
    expect(o.head).toBe("tophat");
    expect(wear(o, "tophat").head).toBeNull();
    o = wear(wear(o, "glasses"), "shades");
    expect(o.eyes).toBe("shades");
  });

  test("takes any jewellery, but one pair of earrings at a time", () => {
    let o = wear(wear(wear(BARE, "studs"), "bindi"), "pearls");
    expect(o.jewels).toEqual(["studs", "bindi", "pearls"]);
    o = wear(o, "jhumkas");
    expect(o.jewels).toEqual(["jhumkas", "bindi", "pearls"]);
    expect(wear(o, "bindi").jewels).toEqual(["jhumkas", "pearls"]);
  });

  test("is written as short words and read back the same; junk is left out", () => {
    const o: Outfit = { head: "captain", jewels: ["hoops", "nath", "tikka"], eyes: "glasses" };
    expect(outfitCode(o)).toBe("captain.hoops.nath.tikka.glasses");
    expect(outfitFromCode(outfitCode(o))).toEqual(o);
    expect(outfitFromCode("crown.<script>.studs.hoops.santa..bindi")).toEqual({ head: "crown", jewels: ["studs", "bindi"], eyes: null });
    expect(outfitFromCode("")).toEqual(BARE);
    expect(tidyOutfit({ head: "wig", jewels: ["pearls", 3, "pearls"], eyes: "monocle" })).toEqual({ head: null, jewels: ["pearls"], eyes: null });
    expect(tidyOutfit(null)).toEqual(BARE);
  });

  test("a wardrobe keeps each singer's outfit at its place, and nothing for the bare", () => {
    const w = { 0: { head: "crown", jewels: [], eyes: null }, 2: { head: "santa", jewels: ["hoops"], eyes: null }, 3: BARE } as const;
    const code = wardrobeCode(w);
    expect(code).toBe("crown~~santa.hoops");
    const back = wardrobeFromCode(code);
    expect(back).toEqual({ 0: w[0], 2: w[2] });
    expect(wardrobeFromCode("a~b~c~d~e~f~crown")).toEqual({});
    expect(Object.keys(tidyWardrobe({ 1: BARE, 9: { head: "crown" }, 4: { head: "beanie" } }))).toEqual(["4"]);
  });

  test("Surprise me is the same for the same seed, differs between seeds, and dresses everyone", () => {
    expect(surprise(3, 6)).toEqual(surprise(3, 6));
    expect(JSON.stringify(surprise(3, 6))).not.toBe(JSON.stringify(surprise(4, 6)));
    for (let seed = 1; seed < 40; seed++) {
      const dealt = surprise(seed, 6);
      expect(dealt.length).toBe(6);
      for (const o of dealt) {
        expect(isBare(o)).toBe(false);
        expect(tidyOutfit(o)).toEqual(o);
      }
      // The hats are dealt like cards: no two singers of a choir share one.
      const hats = dealt.map((o) => o.head).filter(Boolean);
      expect(new Set(hats).size).toBe(hats.length);
    }
  });
});

describe("what is worn", () => {
  test("every item is made, the same every time, with no stray numbers and a style", () => {
    for (const id of ALL) {
      const a = makeItem(id);
      expect(a.count).toBeGreaterThan(200);
      expect(a.count).toBeLessThan(60000);
      expect(a.floats.every(Number.isFinite)).toBe(true);
      expect(ITEM_STYLE[id]).toBeDefined();
      expect(makeItem(id).floats).toEqual(a.floats);
    }
  });

  test("nothing worn uses the sound's warm gold, in either look", () => {
    // warm #ffd58a: red high, green high, blue about two thirds lower.
    const golden = ([r, g, b]: readonly number[]) => r > 0.9 && g > 0.7 && b < 0.65;
    for (const id of ALL) {
      const s = ITEM_STYLE[id];
      for (const c of [s.tint, s.accent, s.vivid, s.vividAccent]) expect(golden(c)).toBe(false);
    }
  });

  test("every hat sits above the eyes and on the skull, not inside it", () => {
    for (const h of HEADWEAR) {
      const ps = of(h.id);
      const low = Math.min(...ps.map((p) => p[1]));
      // Over the face it is above the brows (round the back it may come lower, as a beanie does).
      const front = Math.min(...ps.filter((p) => p[0] > EYE.x - 2).map((p) => p[1]));
      expect(front).toBeGreaterThan(EYE.y + EYE.high + 1.5);
      // Its motes stand on or outside the skull, within a hair's breadth.
      const inside = ps.filter((p) => pillow(p[0], p[1], p[2]) < -0.35).length;
      expect(inside / ps.length).toBeLessThan(0.02);
      // And it is worn, not floating: much of its lowest ring is close to the head (the rest a brim).
      const band = ps.filter((p) => p[1] < low + 1.5);
      const near = band.filter((p) => Math.abs(clearance(p, pillow)) < 2.6).length;
      expect(near / band.length).toBeGreaterThan(0.45);
    }
  });

  test("a hat stays above the eyes on every body's head, as the stage places them", () => {
    const at = new Float32Array(3);
    const eye = new Float32Array(3);
    for (const body of Object.values(BODIES)) {
      const place = { x: 4, y: -2, z: -7, turn: 0.75, scale: headScale(body) };
      placePoint(place, EYE.x, EYE.y + EYE.high, EYE.z, eye);
      for (const h of HEADWEAR) {
        let lowest = Infinity;
        for (const p of of(h.id)) {
          if (p[0] < EYE.x - 2) continue;
          placePoint(place, p[0], p[1], p[2], at);
          lowest = Math.min(lowest, at[1]);
        }
        expect(lowest - eye[1]).toBeGreaterThan(1.5 * place.scale);
      }
    }
  });

  test("a hat that covers the head dims the skin above its own band, and nothing below the eyes", () => {
    for (const id of Object.keys(BANDS) as (keyof typeof BANDS)[]) {
      const c = coverOf(id);
      if (!BANDS[id].cover) continue;
      expect(c).not.toBeNull();
      const [nx, ny, d] = c!;
      expect(nx * -1 + ny * 18 - d).toBeGreaterThan(0); // the crown is under it
      expect(nx * 8 + ny * EYE.y - d).toBeLessThan(-1); // the eyes are not
    }
    expect(coverOf(null)).toBeNull();
    expect(coverOf("tiara")).toBeNull();
  });

  test("the lobe is on the ear, outside the head", () => {
    expect(Math.abs(clearance(LOBE))).toBeLessThan(0.45);
    expect(pillow(LOBE[0], LOBE[1], LOBE[2])).toBeGreaterThan(0.2);
    expect(skin(LOBE[0], LOBE[1], LOBE[2])).toBeLessThan(0.4);
  });

  test("earrings hang at both lobes, and below them", () => {
    for (const id of ["studs", "hoops", "jhumkas"] as const) {
      const ps = of(id);
      for (const side of [1, -1]) {
        const mine = ps.filter((p) => Math.sign(p[2]) === side);
        expect(mine.length).toBeGreaterThan(ps.length * 0.4);
        for (const p of mine) {
          const dx = p[0] - LOBE[0];
          const dz = p[2] - side * LOBE[2];
          // Near the lobe across, and hanging from it (never above the top of the ear's lobe).
          expect(Math.hypot(dx, dz)).toBeLessThan(1.6);
          expect(p[1]).toBeLessThan(LOBE[1] + 0.6);
          expect(p[1]).toBeGreaterThan(LOBE[1] - 3.2);
        }
      }
    }
  });

  test("glasses stand in front of both eyes, and their arms reach back to the ears", () => {
    for (const id of ["glasses", "shades"] as const) {
      const ps = of(id);
      for (const side of [1, -1]) {
        const lens = ps.filter((p) => p[0] > EYE.x + 1.6 && Math.hypot(p[1] - EYE.y, p[2] - side * EYE.z) < 1.4);
        expect(lens.length).toBeGreaterThan(50);
        const arm = ps.filter((p) => p[0] < 1 && Math.sign(p[2]) === side);
        expect(arm.length).toBeGreaterThan(20);
      }
      // Never through the face (behind the ear the arm tucks in against it).
      const inside = ps.filter((p) => p[0] > 0 && skin(p[0], p[1], p[2]) < -0.1).length;
      expect(inside).toBe(0);
    }
  });

  test("the bindi is between the brows, the tikka on the brow under the parting, the pearls round the neck", () => {
    const bindi = of("bindi");
    for (const p of bindi) {
      expect(Math.abs(p[2])).toBeLessThan(0.5);
      expect(p[1]).toBeGreaterThan(EYE.y + 1.5);
      expect(Math.abs(clearance(p))).toBeLessThan(0.3);
    }
    const tikka = of("tikka");
    expect(Math.max(...tikka.map((p) => Math.abs(p[2])))).toBeLessThan(1.3);
    expect(Math.min(...tikka.map((p) => p[1]))).toBeGreaterThan(EYE.y + 2.5);
    const pearls = of("pearls");
    expect(Math.max(...pearls.map((p) => p[1]))).toBeLessThan(-6);
    const inside = pearls.filter((p) => skin(p[0], p[1], p[2]) < -0.1).length;
    expect(inside / pearls.length).toBeLessThan(0.01);
  });

  test("an outfit's items are what it has on, head first", () => {
    expect(itemsOf({ head: "turban", jewels: ["nath", "pearls"], eyes: "shades" })).toEqual(["turban", "nath", "pearls", "shades"]);
    expect(itemsOf(null)).toEqual([]);
  });
});
