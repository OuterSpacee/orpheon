// A song for the director's tests, as plain numbers.
import type { Music } from "../../src/view/director.ts";

/**
 * A hymn of four voices and a band, in lines of 5 s: the band alone for 6 s, the soprano alone
 * for two lines, the alto joins for two, the men alone for two, everyone for four more (the band
 * fuller), the last line held.
 */
export function hymn(): Music {
  const line = 5;
  const lines: [number, number][] = [];
  for (let k = 0; k < 11; k++) lines.push([6 + k * line, 6 + (k + 1) * line - 0.4]);
  lines[10][1] += 4;
  const sing = (from: number, to: number) => lines.slice(from, to).map(([a, b]) => [a, b] as [number, number]);
  const voices = [
    [...sing(0, 4), ...sing(6, 11)],
    [...sing(2, 4), ...sing(6, 11)],
    [...sing(4, 11)],
    [...sing(4, 11)],
  ];
  const band: { t: number; d: number; velocity: number }[] = [];
  for (let t = 0; t < 65; t += 0.5) band.push({ t, d: 0.5, velocity: t > 36 ? 0.9 : 0.4 });
  return { length: 65, voices, lines, band };
}

