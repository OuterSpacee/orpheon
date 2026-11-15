// A part of the body as a pile of particles, in the layout the vertex shader reads.
//
// Each particle is 8 floats and 4 bytes:
//   floats  a, b, c    where it is: a place at rest for most kinds, or its own coordinates
//                      along the airway for the kinds that the telemetry moves (see KIND)
//           seed       0..1, its own random number
//           nx, ny, nz which way its surface faces (so shells brighten at their edges), or
//                      spare numbers for the kinds that have no fixed surface
//           size       in cm; negative marks a particle that only shows in the cut view
//   bytes   kind, w1, w2, tag   (what w1, w2 and tag mean depends on the kind)
import type { LayerId } from "../contract.ts";

/** How a particle moves. The vertex shader has one branch per kind. */
export const KIND = {
  /**
   * At rest at (a, b, c). w1: how much it follows the jaw. w2: how much it follows the lips. tag: 1 if
   * below the lip line, plus 4 × (0..15) for how sharply the surface bends there, plus 64 for a
   * lid (then w2 is where it is from the lower lid, 0, to the upper, 1) or 128 for an eyeball
   * (then w2 is 1 on the iris, 0 on the white).
   */
  rigid: 0,
  /** The tongue. a: along the airway. b: sideways, -1..1 of the tongue's width. c: depth, 0 its surface to 1 the floor of the mouth. */
  tongue: 1,
  /** The wall of the air column. a: along. b: sideways, -1..1 of the lens. c: 0 the roof side, 1 the floor side. */
  wall: 2,
  /** Air that travels. a: along, at flow zero. b: sideways. c: 0 roof to 1 floor. nx: its speed. */
  flow: 3,
  /** Air in the nose. a: along the nose. b: across, -1..1. c: sideways, 0 the middle wall to 1 the outer wall. nx: which side. ny: speed. */
  noseAir: 4,
  /** The soft palate. a: 0 its hinge to 1 its tip. b: sideways, -1..1. c: 0 its underside to 1 its top. */
  velum: 5,
  /** At rest at (a, b, c); rides up and down with the larynx by w1. */
  larynx: 6,
  /** A vocal fold. a: 0 the front end to 1 the back. b: 0 its lower lip to 1 its top. c: 0 its free edge to 1 where it meets the wall. nx: which side. */
  fold: 7,
  /** The lungs, at rest at (a, b, c). w1: distance down the airways from the windpipe. tag 1: an airway (lights with the breath), 0: the outside of a lung. */
  lung: 8,
  /** Sound in the open air. (a, b, c): the direction it leaves in. nx: where along its way it starts. ny: 0 from the mouth, ±1 from a nostril. */
  sound: 9,
} as const;

export const FLOATS = 8;
export const BYTES = 4;

export interface Part {
  id: LayerId;
  count: number;
  floats: Float32Array;
  bytes: Uint8Array;
  /** A few of its resting places [x, y, z, …], for finding what the pointer is over. */
  marks: Float32Array;
}

export class Dust {
  private floats: Float32Array;
  private bytes: Uint8Array;
  private marks: number[] = [];
  count = 0;

  constructor(
    private id: LayerId,
    private random: () => number,
    room = 4096,
  ) {
    this.floats = new Float32Array(room * FLOATS);
    this.bytes = new Uint8Array(room * BYTES);
  }

  /** Add a particle. `w1` and `w2` are 0..1. */
  add(kind: number, a: number, b: number, c: number, nx: number, ny: number, nz: number, size: number, w1 = 0, w2 = 0, tag = 0): void {
    if ((this.count + 1) * FLOATS > this.floats.length) this.grow();
    let o = this.count * FLOATS;
    const f = this.floats;
    f[o++] = a;
    f[o++] = b;
    f[o++] = c;
    f[o++] = this.random();
    f[o++] = nx;
    f[o++] = ny;
    f[o++] = nz;
    f[o] = size;
    o = this.count * BYTES;
    const k = this.bytes;
    k[o++] = kind;
    k[o++] = Math.round(w1 * 255);
    k[o++] = Math.round(w2 * 255);
    k[o] = tag;
    this.count++;
  }

  /** Remember a place on this part that the pointer can find. */
  mark(x: number, y: number, z: number): void {
    this.marks.push(x, y, z);
  }

  private grow(): void {
    const floats = new Float32Array(this.floats.length * 2);
    floats.set(this.floats);
    this.floats = floats;
    const bytes = new Uint8Array(this.bytes.length * 2);
    bytes.set(this.bytes);
    this.bytes = bytes;
  }

  /**
   * The finished part, its particles in random order: drawing only the first half of them then
   * draws the same shape at half the density, which is how the view sheds load on a slow machine.
   */
  finish(): Part {
    const n = this.count;
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    const floats = new Float32Array(n * FLOATS);
    const bytes = new Uint8Array(n * BYTES);
    for (let i = 0; i < n; i++) {
      const from = order[i];
      floats.set(this.floats.subarray(from * FLOATS, from * FLOATS + FLOATS), i * FLOATS);
      bytes.set(this.bytes.subarray(from * BYTES, from * BYTES + BYTES), i * BYTES);
    }
    return { id: this.id, count: n, floats, bytes, marks: new Float32Array(this.marks) };
  }
}
