// A song as the page would perform it (its choir and band), and the heads as the stage seats
// them: for the director's tests and for printing a song's shot list.
import { ready } from "../../src/lang/index.ts";
import { lineup, performance } from "../../src/app/sing/plan.ts";
import { setupPatch } from "../../src/app/sing/setup.ts";
import { INITIAL } from "../../src/app/state.ts";
import type { Performance, State } from "../../src/app/state.ts";
import { castOf } from "../../src/app/ui/stage.ts";
import type { Singer } from "../../src/app/film/overlay.ts";

export async function performed(song: string, lang: "en" | "la" | "es" | "it" | "ja" = "en"): Promise<{ p: Performance; singers: Singer[] }> {
  await ready(lang);
  const s0: State = { ...INITIAL, mode: "sing", song };
  const s = { ...s0, ...setupPatch(s0, { choir: true, band: true, voices: 4, instruments: null }) };
  const lu = lineup(s)!;
  const p = performance(lu, s).performance;
  const singers = castOf({ ...s, playing: p }).map((x) => ({ name: x.name, seat: x.seat, score: x.score }));
  return { p, singers };
}
