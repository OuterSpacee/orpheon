// The lips: two rolls from corner to corner, drawn shut. The shader swings the lower one with the
// jaw, parts them by what the tube's last cross-section asks, and draws the corners in and the
// middle forward when they round.
import { MOUTH_HALF } from "../body.ts";
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

export function makeLips(count: number): Part {
  const random = seeded(41);
  const dust = new Dust("lips", random, count);
  for (let i = 0; i < count; i++) {
    const lower = random() < 0.52;
    const cut = random() < 0.07;
    const z = cut ? 0 : (random() * 2 - 1) * MOUTH_HALF;
    const t = z / MOUTH_HALF;
    // Full in the middle, tapering to nothing at the corners, which sit a little back and down.
    const tall = (lower ? 0.56 : 0.47) * Math.pow(1 - t * t, 0.6) + 0.05;
    const deep = 0.42 * Math.pow(1 - t * t, 0.3) + 0.05;
    const cx = (lower ? 8.84 : 8.95) - 0.21 * z * z;
    const cy = (lower ? -tall - 0.02 : tall + 0.02) - 0.1 * t * t;
    const a = random() * Math.PI * 2;
    // The corners belong to both lips, so they follow the jaw halfway.
    const jaw = lower ? 1 - 0.5 * t * t : 0.5 * t * t;
    if (cut) {
      const r = Math.sqrt(random());
      dust.add(KIND.rigid, cx + Math.cos(a) * deep * r, cy + Math.sin(a) * tall * r, 0, 0, 0, 1, r > 0.85 ? -0.9 : -0.55, jaw, 1, lower ? 1 : 0);
    } else {
      const inside = random() < 0.12 ? Math.sqrt(random()) : 1;
      dust.add(
        KIND.rigid,
        cx + Math.cos(a) * deep * inside, cy + Math.sin(a) * tall * inside, z,
        Math.cos(a) / deep, Math.sin(a) / tall, t * 0.6,
        inside < 1 ? 0.6 : 0.8 + random() * 0.3, jaw, 1, lower ? 1 : 0,
      );
    }
  }
  return dust.finish();
}
