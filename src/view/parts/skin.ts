// The skin of the face and neck: a shell of dust on the outside of the head, a little more just
// under it, and the cut face that shows when the head is sliced.
import { seeded, smoothstep } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";
import { EYE, eyeLid, jawShare, lipShare, skin } from "../head.ts";
import { scatterInSlice, scatterOnSurface } from "../solid.ts";

/** A skin particle's tag when it is part of a lid, and when it is part of an eyeball (see KIND.rigid). */
export const LID = 64;
export const EYEBALL = 128;

/**
 * One eyeball, looking straight ahead: the white as a shell, the iris as a disc of radial streaks
 * a little behind the front of the eye, brightest at its outer ring, and the pupil a dark hole.
 * w2 marks the iris (1) from the white (0).
 */
function makeEye(dust: Dust, random: () => number, side: number, count: number): void {
  const cz = side * EYE.z;
  const r = EYE.r;
  /** The iris reaches this angle from straight ahead, the pupil this one. */
  const IRIS = 0.53;
  const PUPIL = 0.19;
  const front = Math.cos(IRIS) * r;
  for (let i = 0; i < count; i++) {
    const pick = random();
    if (pick < 0.16) {
      // The cornea: a clear dome over the iris, of a smaller sphere than the eye, so it bulges.
      // Glass like the skin, it shows as a bright arc from the side. w1 marks it.
      const a = Math.acos(1 - (1 - Math.cos(0.8)) * random());
      const b = random() * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a) * Math.cos(b);
      const nz = Math.sin(a) * Math.sin(b);
      const rc = 0.8;
      const ahead = r + 0.1 - rc;
      dust.add(KIND.rigid, EYE.x + ahead + nx * rc, EYE.y + ny * rc, cz + nz * rc, nx, ny, nz, 0.5 + 0.2 * random(), 1, 0, EYEBALL);
    } else if (pick < 0.68) {
      // The white: a shell, the front of it (what the lids can show) more than the back.
      const a = Math.acos(1 - 2 * Math.pow(random(), 1.6));
      if (a < IRIS) continue;
      const b = random() * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a) * Math.cos(b);
      const nz = Math.sin(a) * Math.sin(b);
      dust.add(KIND.rigid, EYE.x + nx * r, EYE.y + ny * r, cz + nz * r, nx, ny, nz, 0.6 + random() * 0.3, 0, 0, EYEBALL);
    } else {
      // The iris: streaks running out from the pupil, a ruff of light round the pupil, and its rim.
      const b = random() * Math.PI * 2;
      const streak = 0.55 + 0.45 * Math.sin(b * 23 + Math.sin(b * 7) * 2);
      if (random() > streak) continue;
      const t = Math.sqrt(random());
      const angle = PUPIL + (IRIS - PUPIL) * t;
      if (angle < PUPIL + 0.02 && random() < 0.5) continue;
      const rho = Math.sin(angle) * r;
      const rim = angle > IRIS - 0.06 ? 1 : 0;
      const ruff = Math.abs(angle - (PUPIL + 0.1)) < 0.03 ? 1 : 0;
      dust.add(KIND.rigid, EYE.x + front, EYE.y + rho * Math.cos(b), cz + rho * Math.sin(b), 1, 0, 0, 0.55 + 0.2 * random(), 0, 1, EYEBALL + 4 * (rim ? 14 : ruff ? 8 : 0));
    }
  }
}

export function makeSkin(count: number): Part {
  const random = seeded(11);
  const dust = new Dust("skin", random, count);
  // The neck fades out below the collar instead of ending in an edge.
  const fade = (y: number) => smoothstep(-16.5, -9.5, y);

  let n = 0;
  scatterOnSurface(skin, {
    box: [-12, -17, -9.5, 12, 19, 9.5],
    count: Math.round(count * 0.9),
    random,
    // The face carries the likeness, so it gets more of the dust than the back of the head.
    keep: (x, y) => fade(y) * (x > 3 && y > -6 && y < 11 ? 1 : 0.55),
    emit(x, y, z, nx, ny, nz, bend) {
      // One in eight sits just under the surface, so the shell has a little depth.
      const under = random() < 0.12 ? -Math.log(1 - random() * 0.95) * 0.3 : 0;
      const px = x - nx * under;
      const py = y - ny * under;
      const pz = z - nz * under;
      const size = under > 0 ? 0.6 : 0.75 + random() * 0.5;
      // Where the surface bends sharply (the nose, the lids, the rim of the ear) it is drawn
      // brighter: the features are lines of light on a head of glass.
      let crease = under > 0 ? 0 : Math.round(bend * 15);
      // Over each eye, the lids: hidden while the eye is open, drawn down over it in a blink. The
      // rim of the opening is a line of light, as the creases are.
      const lid = eyeLid(px, py, pz);
      if (lid.inside) dust.add(KIND.rigid, px, py, pz, nx, ny, nz, size, 0, lid.v, LID + 4 * crease);
      else {
        if (under === 0) crease = Math.max(crease, Math.round(11 * lid.edge));
        dust.add(KIND.rigid, px, py, pz, nx, ny, nz, size, jawShare(px, py, pz), lipShare(px, py, pz), (py < 0 ? 1 : 0) + 4 * crease);
      }
      if (n++ % 160 === 0) dust.mark(px, py, pz);
    },
  });

  for (const side of [-1, 1]) makeEye(dust, random, side, Math.round(count * 0.03));

  scatterInSlice(skin, {
    box: [-12, -17, 12, 19],
    count: Math.round(count * 0.1),
    random,
    depth: 1.1,
    keep: (_x, y) => fade(y),
    emit(x, y, under) {
      dust.add(KIND.rigid, x, y, 0, 0, 0, 1, -(1.0 - 0.5 * under), jawShare(x, y, 0), lipShare(x, y, 0), y < 0 ? 1 : 0);
    },
  });
  return dust.finish();
}
