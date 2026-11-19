// How thick and how colourful the body is drawn, and what the singers wear: this viewer's own
// taste, kept in this browser. (What they wear also travels in a link: link.ts.)
import { wardrobeCode, wardrobeFromCode } from "../view/decor/outfit.ts";
import type { State } from "./state.ts";

export const LOOK_KEY = "orpheon.look";

type Kept = Pick<State, "density" | "colour" | "outfits">;

/** The look as it is kept: the outfits in their short written form. */
export function lookToKeep(s: Kept): string {
  return JSON.stringify({ density: s.density, colour: s.colour, dress: wardrobeCode(s.outfits) });
}

/** The density, colour and outfits this browser last chose, checked; whatever is missing or odd is left out. */
export function lookKept(): Partial<Kept> {
  try {
    const kept = JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null") as unknown;
    if (!kept || typeof kept !== "object") return {};
    const { density, colour, dress } = kept as Record<string, unknown>;
    const out: Partial<Kept> = {};
    if (typeof density === "number" && density >= 0.05 && density <= 1) out.density = density;
    if (typeof colour === "number" && colour >= 0 && colour <= 1) out.colour = colour;
    if (typeof dress === "string") out.outfits = wardrobeFromCode(dress);
    return out;
  } catch {
    return {};
  }
}
