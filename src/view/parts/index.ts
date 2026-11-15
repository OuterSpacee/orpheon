// The whole body as particles: one part for each entry of LAYERS.
import { LAYERS, type LayerId } from "../../contract.ts";
import type { Part } from "../dust.ts";
import { STYLE } from "../layers.ts";
import { makeAir } from "./air.ts";
import { makeBone } from "./bone.ts";
import { makeLarynx } from "./larynx.ts";
import { makeLips } from "./lips.ts";
import { makeLungs } from "./lungs.ts";
import { makeNose } from "./nose.ts";
import { makePalate } from "./palate.ts";
import { makeSkin } from "./skin.ts";
import { makeSound } from "./sound.ts";
import { makeTongue } from "./tongue.ts";

const MAKERS: Record<LayerId, (count: number) => Part> = {
  skin: makeSkin, bone: makeBone, tongue: makeTongue, lips: makeLips, palate: makePalate,
  nose: makeNose, air: makeAir, larynx: makeLarynx, lungs: makeLungs, sound: makeSound,
};

/** The order the parts are made in: the quick ones that carry the action first, the two big shells last. */
export const MAKING_ORDER: LayerId[] = ["air", "tongue", "lips", "palate", "larynx", "nose", "sound", "lungs", "skin", "bone"];

export { BUILT } from "../layers.ts";

/** Make one part. `share` scales how many particles it gets (1 = the full count). */
export function makePart(id: LayerId, share = 1): Part {
  return MAKERS[id](Math.round(STYLE[id].count * share));
}

/** Make every part, here and now, in the order of LAYERS. */
export function makeBody(share = 1): Part[] {
  return LAYERS.map((layer) => makePart(layer.id, share));
}
