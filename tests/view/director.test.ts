// The director: a song's shot list. Shots start on the music's own boundaries (a line, a voice
// coming in, the band alone, the ending) and are held at least MIN_SHOT seconds; a voice that
// comes in gets the camera; the climax gets the low angle and the ending the crane; the camera
// glides without a jerk where it does not cut; the same song and seed give the same camera, and
// nothing is ever NaN, whatever the song.
import { expect, test } from "bun:test";
import { MIN_SHOT, cutBetween, makeTake, planShots, shotAt, takeAt } from "../../src/view/director.ts";
import type { Music, Plan, Take } from "../../src/view/director.ts";
import { hymn } from "./hymn.ts";

const starts = (m: Music) => {
  const at = [...m.lines.map(([a]) => a), ...m.voices.flatMap((v) => v.map(([a]) => a))];
  return at;
};

test("every shot starts on a line or a voice coming in, and is held at least MIN_SHOT seconds", () => {
  const m = hymn();
  for (const seed of [1, 2, 3, 6, 42]) {
    const plan = planShots(m, seed);
    expect(plan.shots.length).toBeGreaterThan(5);
    plan.shots.forEach((s, k) => {
      expect(s.t1 - s.t0).toBeGreaterThanOrEqual(MIN_SHOT - 1e-9);
      if (k > 0) {
        expect(s.t0).toBe(plan.shots[k - 1].t1);
        // just before the line's (or the entry's) first syllable, or the ending's rise
        const near = Math.min(...starts(m).map((t) => Math.abs(t - 0.15 - s.t0)));
        if (s.why !== "final" && s.why !== "band") expect(near).toBeLessThan(0.01);
      }
    });
  }
});

test("a voice coming in gets the camera; the climax gets the low angle, the ending the crane", () => {
  const m = hymn();
  for (const seed of [1, 2, 3, 6, 42]) {
    const plan = planShots(m, seed);
    // the soprano's entry at 6 s, the alto's at 16 s
    const soprano = plan.shots[shotAt(plan, 6.5)];
    expect(soprano.who[0]).toBe(0);
    expect(["push", "profile"]).toContain(soprano.kind);
    const alto = plan.shots[shotAt(plan, 16.5)];
    expect(alto.who).toContain(1);
    expect(alto.cut).toBe(true);
    // the men come in at 26 s: both shown
    const men = plan.shots[shotAt(plan, 26.5)];
    expect(men.who.length === 0 || (men.who.includes(2) && men.who.includes(3))).toBe(true);
    const last = plan.shots[plan.shots.length - 1];
    expect(last.kind).toBe("crane");
    const heroes = plan.shots.filter((s) => s.kind === "hero");
    expect(heroes.length).toBeGreaterThanOrEqual(1);
    expect(heroes.length).toBeLessThanOrEqual(2);
    for (const h of heroes) expect(h.t0).toBeGreaterThan(0.4 * 61);
  }
});

test("no shot is taken twice in a row, and the shots are not all one kind", () => {
  for (const seed of [1, 2, 3, 6, 42]) {
    const plan = planShots(hymn(), seed);
    for (let k = 1; k < plan.shots.length; k++) {
      const a = plan.shots[k - 1];
      const b = plan.shots[k];
      expect(`${b.kind}:${[...b.who].sort()}`).not.toBe(`${a.kind}:${[...a.who].sort()}`);
    }
    expect(new Set(plan.shots.map((s) => s.kind)).size).toBeGreaterThanOrEqual(5);
  }
});

const copy = (t: Take) => ({ ...t, focus: [...t.focus] });
const gap = (a: ReturnType<typeof copy>, b: ReturnType<typeof copy>) =>
  Math.max(Math.abs(a.yaw - b.yaw), Math.abs(a.pitch - b.pitch), Math.abs(a.tight - b.tight), Math.abs(a.toward - b.toward), Math.abs(a.pivot - b.pivot), ...a.focus.map((f, i) => Math.abs(f - b.focus[i])));

test("where it does not cut, the camera glides: no jump, and no jerk, at a shot's start", () => {
  const plan = planShots(hymn(), 6);
  const take = makeTake();
  const at = (t: number) => (takeAt(plan, t, take), copy(take));
  const dt = 1 / 60;
  let glides = 0;
  for (const s of plan.shots.slice(1)) {
    if (s.cut) continue;
    glides++;
    const before = at(s.t0 - dt);
    const now = at(s.t0);
    const after = at(s.t0 + dt);
    // the step across the boundary is no bigger than the steps around it (no velocity jump)
    expect(gap(before, now)).toBeLessThan(0.004);
    expect(Math.abs(gap(now, after) - gap(before, now))).toBeLessThan(0.002);
  }
  expect(glides).toBeGreaterThan(0);
  // and within every shot the camera moves slowly: never more than a fraction of a radian a second
  for (let t = -0.5; t < 66; t += dt) {
    const a = at(t);
    const b = at(t + dt);
    if (cutBetween(plan, t, t + dt)) continue;
    expect(Math.abs(b.yaw - a.yaw) / dt).toBeLessThan(0.6);
    expect(Math.abs(b.pitch - a.pitch) / dt).toBeLessThan(0.6);
    expect(Math.abs(b.tight - a.tight) / dt).toBeLessThan(1.2);
  }
});

test("the same song and seed give the same camera; another seed another one", () => {
  const a = planShots(hymn(), 6);
  const b = planShots(hymn(), 6);
  expect(a).toEqual(b);
  const ta = makeTake();
  const tb = makeTake();
  for (let t = -0.5; t < 66; t += 0.37) {
    takeAt(a, t, ta);
    takeAt(b, t, tb);
    expect(copy(ta)).toEqual(copy(tb));
  }
  const other = planShots(hymn(), 7);
  expect(other.shots.map((s) => `${s.t0}${s.kind}${s.who}`)).not.toEqual(a.shots.map((s) => `${s.t0}${s.kind}${s.who}`));
});

test("nothing is NaN, whatever the song: none, silent, one voice, no lines, one note, six voices", () => {
  const songs: Music[] = [
    { length: 0, voices: [], lines: [], band: [] },
    { length: 10, voices: [[], []], lines: [], band: [] },
    { length: 8, voices: [[[0, 7.5]]], lines: [], band: [] },
    { length: 30, voices: [[[1, 4], [5, 9], [14, 20], [21, 29]]], lines: [], band: [{ t: 0, d: 30, velocity: 1 }] },
    { length: 0.5, voices: [[[0, 0.4]], [[0.1, 0.3]]], lines: [[0, 0.4]], band: [] },
    { length: 40, voices: Array.from({ length: 6 }, (_, i) => [[i * 3, 38] as [number, number]]), lines: [[0, 10], [10, 20], [20, 30], [30, 38]], band: [] },
  ];
  for (const m of songs) {
    const plan: Plan = planShots(m, 3, 0.9);
    expect(plan.shots.length).toBeGreaterThan(0);
    const take = makeTake();
    for (let t = -2; t < m.length + 5; t += 0.21) {
      takeAt(plan, t, take);
      for (const v of [take.yaw, take.pitch, take.tight, take.toward, take.pivot, take.detail, ...take.focus]) expect(Number.isFinite(v)).toBe(true);
      const sum = take.focus.reduce((s, f) => s + f, 0);
      expect(sum < 1e-9 || Math.abs(sum - 1) < 1e-6).toBe(true);
    }
    for (const s of plan.shots) for (const h of s.who) expect(h).toBeLessThan(Math.max(1, m.voices.length));
  }
});
