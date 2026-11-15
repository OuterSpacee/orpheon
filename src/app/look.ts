// How thick and how colourful the body is drawn: this viewer's own taste, kept in this browser.
import type { State } from "./state.ts";

export const LOOK_KEY = "orpheon.look";

/** The density and colour this browser last chose, checked; whatever is missing or odd is left out. */
export function lookKept(): Partial<Pick<State, "density" | "colour">> {
  try {
    const kept = JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null") as unknown;
    if (!kept || typeof kept !== "object") return {};
    const { density, colour } = kept as Record<string, unknown>;
    const out: Partial<Pick<State, "density" | "colour">> = {};
    if (typeof density === "number" && density >= 0.05 && density <= 1) out.density = density;
    if (typeof colour === "number" && colour >= 0 && colour <= 1) out.colour = colour;
    return out;
  } catch {
    return {};
  }
}
