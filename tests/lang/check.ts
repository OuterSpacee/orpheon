/** What every Score the language layer makes must satisfy, as a list of what is wrong. */
import { PHONES, type Score } from "../../src/contract.ts";

const EPS = 1e-9;

export function problems(s: Score): string[] {
  const out: string[] = [];
  const known = new Set<string>(PHONES);
  s.phones.forEach((p, i) => {
    if (!known.has(p.ph)) out.push(`phone ${i} "${p.ph}" is not in PHONES`);
    if (!(p.d > 0) || !Number.isFinite(p.d)) out.push(`phone ${i} "${p.ph}" has length ${p.d}`);
    if (!(p.t >= -EPS) || !Number.isFinite(p.t)) out.push(`phone ${i} "${p.ph}" starts at ${p.t}`);
    const prev = s.phones[i - 1];
    if (prev && p.t < prev.t + prev.d - EPS) out.push(`phone ${i} "${p.ph}" at ${p.t} overlaps "${prev.ph}" ending ${prev.t + prev.d}`);
  });
  const last = s.phones[s.phones.length - 1];
  if (last && s.length < last.t + last.d - EPS) out.push(`length ${s.length} is before the last phone ends`);
  const curve = (name: string, pts: { t: number; v: number }[] | undefined, positive: boolean) => {
    pts?.forEach((p, i) => {
      if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) out.push(`${name} point ${i} is not a number`);
      if (positive && !(p.v > 0)) out.push(`${name} point ${i} is ${p.v}`);
      if (i > 0 && p.t < pts[i - 1].t - EPS) out.push(`${name} point ${i} at ${p.t} is before the one before (${pts[i - 1].t})`);
    });
  };
  if (s.phones.length && !s.pitch.length) out.push("no pitch");
  curve("pitch", s.pitch, true);
  curve("vibrato", s.vibrato, false);
  curve("lungs", s.lungs, false);
  s.words?.forEach((w, i) => {
    if (!(w.d >= 0) || w.t < -EPS || w.t + w.d > s.length + EPS) out.push(`word ${i} "${w.text}" is outside the score`);
    const prev = s.words![i - 1];
    if (prev && w.t < prev.t - EPS) out.push(`word ${i} "${w.text}" is before the word before it`);
  });
  return out;
}

/** Seconds at which the pitch line is at `t`, moving straight in log frequency between points. */
export function pitchAt(s: Score, t: number): number {
  const p = s.pitch;
  if (t <= p[0].t) return p[0].v;
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i].t) {
      const a = p[i - 1];
      const b = p[i];
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return a.v * (b.v / a.v) ** k;
    }
  }
  return p[p.length - 1].v;
}

export function valueAt(pts: { t: number; v: number }[], t: number): number {
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : b.v;
    }
  }
  return pts[pts.length - 1].v;
}
