// What the singers wear, on the page's side: it travels in a link and is kept in this browser,
// each singer keeps its own outfit whichever head shows it, and the three actions do what they say.
import { describe, expect, test } from "bun:test";
import { decodeLink, encodeLink } from "../../src/app/link.ts";
import { lookToKeep } from "../../src/app/look.ts";
import { INITIAL } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";
import { dressAll, dressable, surprised } from "../../src/app/ui/dress.ts";
import { castOf } from "../../src/app/ui/stage.ts";
import { BARE, wardrobeFromCode } from "../../src/view/decor/outfit.ts";
import type { Score } from "../../src/contract.ts";

const crown = { head: "crown", jewels: ["pearls"], eyes: null } as const;
const santa = { head: "santa", jewels: [], eyes: "shades" } as const;
const state = (patch: Partial<State>): State => ({ ...INITIAL, ...patch });
const score: Score = { length: 1, points: [], words: [] } as unknown as Score;

describe("outfits in a link and in storage", () => {
  test("a fresh page writes none; a dressed one writes them in every mode, and they come back", () => {
    expect(encodeLink(INITIAL)).toBe("mode=touch");
    for (const mode of ["touch", "speak", "sing", "instrument"] as const) {
      const s = state({ mode, outfits: { 0: crown, 2: santa } });
      const link = encodeLink(s);
      expect(link).toContain("dress=crown.pearls%7E%7Esanta.shades");
      expect(decodeLink(link).outfits).toEqual({ 0: crown, 2: santa });
    }
  });

  test("a stranger's link is checked: unknown things are dropped, too many singers are not believed", () => {
    expect(decodeLink("#mode=touch&dress=crown.hat-of-doom.studs~x~~~~~~santa").outfits).toEqual({ 0: { head: "crown", jewels: ["studs"], eyes: null } });
    expect(decodeLink("#mode=touch").outfits).toBeUndefined();
  });

  test("kept in this browser in the same short form", () => {
    const kept = JSON.parse(lookToKeep(state({ density: 0.5, colour: 0.2, outfits: { 1: santa } })));
    expect(kept).toEqual({ density: 0.5, colour: 0.2, dress: "~santa.shades" });
    expect(wardrobeFromCode(kept.dress)).toEqual({ 1: santa });
  });
});

describe("each singer's own outfit", () => {
  test("a choir's heads are dressed by their place in the line-up, and a singer shown alone keeps its clothes", () => {
    const part = (line: number) => ({ score, body: 2, level: 0.5, place: 0, name: `Line ${line}`, line });
    const playing = { kind: "sing" as const, title: "t", parts: [part(0), part(1), part(1), part(2)] };
    const s = state({ mode: "sing", playing, outfits: { 1: crown } });
    expect(castOf(s).map((x) => x.who)).toEqual([0, 1, 1, 2]);
    // Two voices singing one line in unison are one singer to dress.
    expect(dressable(s).map((x) => x.who)).toEqual([0, 1, 2]);
    const alone = castOf({ ...s, focus: 1 });
    expect(alone.length).toBe(1);
    expect(alone[0].who).toBe(1);
  });

  test("in Sing, before a choir starts, the singers it will have can be dressed", () => {
    const s = state({ mode: "sing" });
    expect(dressable(s, ["Soprano", "Alto", "Tenor"]).map((x) => x.who)).toEqual([0, 1, 2]);
    expect(dressable(s, ["Soprano"]).map((x) => x.who)).toEqual([0]);
  });

  test("Touch's voices and the Instrument's are dressed by their seat; one head is the first singer", () => {
    expect(castOf(state({ mode: "touch", voices: 3 })).map((x) => x.who)).toEqual([0, 1, 2]);
    expect(castOf(state({ mode: "instrument" })).map((x) => x.who)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(castOf(state({ mode: "speak" })).map((x) => x.who)).toEqual([0]);
  });

  test("Dress all the same puts one outfit on every head; None of it leaves nothing", () => {
    expect(dressAll([0, 1, 2], crown, { 3: santa })).toEqual({ 0: crown, 1: crown, 2: crown, 3: santa });
    expect(dressAll([0, 1], BARE, { 0: crown, 1: santa })).toEqual({});
  });

  test("Surprise me dresses every head, the same for the same press, differently for the next", () => {
    const a = surprised([0, 1, 2, 3], 1, {});
    expect(Object.keys(a)).toEqual(["0", "1", "2", "3"]);
    expect(surprised([0, 1, 2, 3], 1, {})).toEqual(a);
    expect(surprised([0, 1, 2, 3], 2, {})).not.toEqual(a);
  });
});
