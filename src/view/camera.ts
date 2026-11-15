// The eye: it circles the head at a distance, always looking at one point of it.
// yaw 0, pitch 0 is the profile facing right. A positive yaw brings the face round toward the
// viewer (yaw π/2 is the face seen from the front); a positive pitch looks down from above.

/** How much of the scene, in cm, fits the height of the picture at zoom 1: the head and neck. */
const TALL = 42;
/** And the least width that must fit, so a narrow screen still holds the whole head. */
const WIDE = 28;
const FIELD = (28 * Math.PI) / 180;

export interface Eye {
  yaw: number;
  pitch: number;
  zoom: number;
  /** What it looks at. */
  at: Float32Array;
  /** How far the picture is slid sideways and up, as a share of half its width and height: the
   * head can sit off-centre (clear of the page's controls) without the eye looking elsewhere. */
  shiftX: number;
  shiftY: number;
  /** Filled by `see`: */
  view: Float32Array;
  lens: Float32Array;
  both: Float32Array;
  place: Float32Array;
  far: number;
  /** Pixels per cm at one cm from the eye. */
  pixels: number;
  width: number;
  height: number;
}

export function makeEye(): Eye {
  return {
    yaw: 0, pitch: 0, zoom: 1, shiftX: 0, shiftY: 0,
    at: new Float32Array([-0.3, 2.0, 0]),
    view: new Float32Array(16), lens: new Float32Array(16), both: new Float32Array(16), place: new Float32Array(3),
    far: 80, pixels: 1, width: 1, height: 1,
  };
}

/** Work out the eye's matrices for a picture of this size. */
export function see(e: Eye, width: number, height: number): void {
  e.width = width;
  e.height = height;
  const aspect = width / height;
  const tall = Math.max(TALL, WIDE / aspect) / e.zoom;
  const far = tall / 2 / Math.tan(FIELD / 2);
  e.far = far;
  e.pixels = height / (2 * Math.tan(FIELD / 2));
  const cp = Math.cos(e.pitch);
  const px = e.at[0] + far * Math.sin(e.yaw) * cp;
  const py = e.at[1] + far * Math.sin(e.pitch);
  const pz = e.at[2] + far * Math.cos(e.yaw) * cp;
  e.place[0] = px;
  e.place[1] = py;
  e.place[2] = pz;
  // Forward, right and up of the eye.
  let fx = e.at[0] - px;
  let fy = e.at[1] - py;
  let fz = e.at[2] - pz;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const v = e.view;
  v[0] = rx; v[4] = 0; v[8] = rz; v[12] = -(rx * px + rz * pz);
  v[1] = ux; v[5] = uy; v[9] = uz; v[13] = -(ux * px + uy * py + uz * pz);
  v[2] = -fx; v[6] = -fy; v[10] = -fz; v[14] = fx * px + fy * py + fz * pz;
  v[3] = 0; v[7] = 0; v[11] = 0; v[15] = 1;
  const near = far * 0.08;
  const end = far * 8;
  const t = 1 / Math.tan(FIELD / 2);
  const l = e.lens;
  l.fill(0);
  l[0] = t / aspect;
  l[5] = t;
  l[10] = (end + near) / (near - end);
  l[11] = -1;
  // Sliding the picture: clip x gains shiftX times w (w is the distance in front of the eye).
  l[8] = -e.shiftX;
  l[9] = -e.shiftY;
  l[14] = (2 * end * near) / (near - end);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += l[k * 4 + r] * v[c * 4 + k];
      e.both[c * 4 + r] = sum;
    }
  }
}

/** Where a point of the scene lands in the picture, in CSS-like pixels from the top left; out[2] is its distance from the eye. */
export function land(e: Eye, x: number, y: number, z: number, out: Float32Array): void {
  const m = e.both;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  out[0] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * e.width;
  out[1] = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * e.height;
  out[2] = w;
}
