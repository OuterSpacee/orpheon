// The director: the camera's shot list for a song, made before a frame is drawn, from what the
// music does, as a director of a concert film works from the score.
//
//   where it cuts   on the song's own boundaries: a voice coming in (its entry gets the camera),
//                   a change of who sings (a new section), the band alone, the last line; and
//                   within a long section on a line's start, never on every line. Every shot is
//                   held at least MIN_SHOT seconds.
//   what it shows   the shot vocabulary below, chosen for what the music is doing: who sings,
//                   who has just come in, how full the sound is, where the song is.
//   how it moves    every shot moves a little (a push, a truck, an arc, a rise), eased so it
//                   starts and stops at rest; into a shot the camera either cuts (a new voice, a
//                   new section) or glides from where the last one left it, without a jerk.
//
// The vocabulary:
//   wide     the whole choir, a slow push from a little wider: the establishing shot
//   push     a slow push-in on one voice, at its entry
//   close    a held close shot of one voice, creeping in
//   two      two voices that sing together, framed together
//   profile  one head side on (the airway seen whole), facing the voice it sings with
//   arc      a slow orbit around a voice, or around the choir
//   hero     from below, looking up: the climax
//   crane    the eye rises and draws back over the last chord
//   inside   into the throat of a voice singing alone and quietly, where the voice is seen
// Over all of it a gentle drift, as a camera held by hand, seeded: slow, never a shake.
//
// Everything here is plain numbers in and out (no DOM, no time of its own): the same song and seed
// give the same shots, and `takeAt` gives the same camera for the same time.

export type ShotKind = "wide" | "push" | "close" | "two" | "profile" | "arc" | "hero" | "crane" | "inside";

/** What the director needs to know about a song. Seconds on the performance's clock. */
export interface Music {
  /** How long it lasts. */
  length: number;
  /** For each head on the stage (the cast's order), the spans it sings. */
  voices: readonly (readonly (readonly [number, number])[])[];
  /** The song's lines (its captions): when each starts and ends. */
  lines: readonly (readonly [number, number])[];
  /** The band's notes. */
  band: readonly { t: number; d: number; velocity: number }[];
}

export interface Shot {
  t0: number;
  t1: number;
  kind: ShotKind;
  /** The heads it is on, the one it is about first; empty: the whole choir. */
  who: number[];
  /** Cut into it, or (false) the camera moves into it from where the last shot left it. */
  cut: boolean;
  /** Which way it travels. */
  side: 1 | -1;
  /** Why it starts where it does: "start", "entry", "section", "band", "line", "final". */
  why: string;
}

export interface Plan {
  shots: Shot[];
  heads: number;
  seed: number;
  /** How far the camera moves, 0..1 (the motion's strength). */
  strength: number;
}

/** What the camera does at one instant, for the view to frame. */
export interface Take {
  /** Added to the eye's turn and lean, radians (a negative pitch looks up from below). */
  yaw: number;
  pitch: number;
  /**
   * How close: 0 the whole choir as framed, 1 the shot's heads as large as the frame holds
   * them (names and all); below 0, wider than the choir (the zoom is then 1 + tight).
   */
  tight: number;
  /** 0 the frame centred on the choir .. 1 on the shot's heads. */
  toward: number;
  /** 0 the eye circles the choir's middle .. 1 the shot's heads (an arc around a voice). */
  pivot: number;
  /** 0 the shot keeps its heads whole .. 1 it goes in close on the throat (inside). */
  detail: number;
  /** Each head's share of the shot (sums to 1, or all 0 for the choir). */
  focus: Float32Array;
}

/** The shortest a shot is held, in seconds. */
export const MIN_SHOT = 3.2;
/** A stretch longer than this (give or take) is cut within, at a line. */
const LONG = 7.5;
/** A rest at least this long before a voice sings again makes its singing an entry. */
const ENTRY_REST = 2.5;
/** The band alone this long is a section of its own. */
const BAND_ALONE = 3.5;
/** How long the camera takes at least to glide from one shot into the next, and at most (a share of the shot). */
const GLIDE = 2.4;
const GLIDE_SHARE = 0.6;
/** The fastest a glide turns the eye, radians a second at its quickest. */
const GLIDE_TURN = 0.4;

/** A small seeded generator: the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spans run together across a gap shorter than `gap`. */
function merged(spans: readonly (readonly [number, number])[], gap: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a - last[1] < gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Seconds of [a, b] covered by the spans. */
function covered(spans: readonly (readonly [number, number])[], a: number, b: number): number {
  let sum = 0;
  for (const [s, e] of spans) sum += Math.max(0, Math.min(b, e) - Math.max(a, s));
  return sum;
}

interface Mark {
  t: number;
  strength: number;
  why: string;
  /** Heads that come in here. */
  enter: number[];
}

/** The shots for a song: where they start, what they show, how the camera gets into each. */
export function planShots(music: Music, seed: number, strength = 0.7): Plan {
  const n = music.voices.length;
  const length = Math.max(0, music.length);
  const rng = seeded(seed * 7919 + 17);
  const sung = music.voices.map((spans) => merged(spans, 0.35));
  const all = merged(sung.flat(), 0.35);
  const plan: Plan = { shots: [], heads: n, seed, strength };
  if (!n || !all.length) {
    plan.shots.push({ t0: -0.5, t1: Math.max(length, 1), kind: "wide", who: [], cut: true, side: 1, why: "start" });
    return plan;
  }
  const lastSound = Math.max(...all.map((s) => s[1]));

  // ── where it may cut, and how strongly the music asks for it ──
  const marks: Mark[] = [];
  const lines = [...music.lines].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  // Without lines, every phrase (singing after a breath) stands for one.
  const phrases = lines.length ? lines : merged(sung.flat(), 0.6);
  const singersOf = (a: number, b: number) => sung.map((s, i) => (covered(s, a, b) > 0.25 * Math.min(b - a, 2) ? i : -1)).filter((i) => i >= 0);
  phrases.forEach(([a, b], k) => {
    const now = singersOf(a, b).join(",");
    const before = k > 0 ? singersOf(phrases[k - 1][0], phrases[k - 1][1]).join(",") : "";
    marks.push({ t: a - 0.15, strength: k > 0 && now !== before ? 2 : 1, why: k > 0 && now !== before ? "section" : "line", enter: [] });
  });
  sung.forEach((spans, head) => {
    spans.forEach(([a], k) => {
      if (k === 0 || a - spans[k - 1][1] >= ENTRY_REST) marks.push({ t: a - 0.15, strength: 3, why: "entry", enter: [head] });
    });
  });
  for (let k = 1; k < all.length; k++) {
    if (all[k][0] - all[k - 1][1] >= BAND_ALONE) marks.push({ t: all[k - 1][1] + 0.6, strength: 2, why: "band", enter: [] });
  }
  // The last line (or the last phrase) is the ending: the camera rises over it.
  const finalAt = Math.max(0, phrases[phrases.length - 1][0] - 0.15);
  marks.push({ t: finalAt, strength: 4, why: "final", enter: [] });

  // Marks close together are one: the strongest names it, and every voice that comes in counts.
  marks.sort((x, y) => x.t - y.t);
  const moments: Mark[] = [];
  for (const m of marks) {
    const last = moments[moments.length - 1];
    if (last && m.t - last.t < 0.6) {
      if (m.strength > last.strength) {
        last.strength = m.strength;
        last.why = m.why;
      }
      for (const h of m.enter) if (!last.enter.includes(h)) last.enter.push(h);
    } else moments.push({ ...m, enter: [...m.enter] });
  }

  // ── the cuts: the strong ones first, held apart; then lines, within what is still long ──
  const start = Math.min(-0.5, all[0][0] - MIN_SHOT);
  const cuts: Mark[] = [];
  const free = (t: number) => t - start >= MIN_SHOT && t <= length + 0.5 && cuts.every((c) => Math.abs(c.t - t) >= MIN_SHOT);
  // the ending must have room before it and the camera time to rise over it
  for (const m of [...moments].filter((m) => m.strength >= 2).sort((x, y) => y.strength - x.strength || x.t - y.t)) if (free(m.t)) cuts.push(m);
  cuts.sort((x, y) => x.t - y.t);
  // Within a long stretch, lines are taken one shot after another, each shot as long as chance
  // says within what looks right (one line, two, sometimes three): never a cut on every line in
  // a steady beat.
  const weak = moments.filter((m) => m.strength < 2);
  const edges = [start, ...cuts.map((c) => c.t), lastSound + 3];
  for (let k = 0; k + 1 < edges.length; k++) {
    let a = edges[k];
    const b = edges[k + 1];
    while (b - a > LONG + 2) {
      const goal = a + LONG * (0.7 + 0.6 * rng());
      let best: Mark | null = null;
      for (const m of weak) if (m.t - a >= MIN_SHOT && b - m.t >= MIN_SHOT && (!best || Math.abs(m.t - goal) < Math.abs(best.t - goal))) best = m;
      if (!best) break;
      cuts.push(best);
      a = best.t;
    }
  }
  cuts.sort((x, y) => x.t - y.t);
  // A long ending (a last line broadened, a chord held) is seen close first; the camera rises over its last seconds.
  const ending = cuts[cuts.length - 1];
  if (ending && ending.why === "final" && lastSound + 1.5 - ending.t > 15) {
    const goal = lastSound + 1.5 - 10;
    let best = -1;
    // at a syllable that starts there (a held ending has no breath to cut at)
    for (const [x] of music.voices.flat()) if (x - ending.t >= MIN_SHOT + 1 && lastSound - x >= 6 && (best < 0 || Math.abs(x - goal) < Math.abs(best - goal))) best = x;
    // (and a note held through it all is risen over from where chance would have cut)
    if (best < 0) best = goal + 0.15;
    if (best > 0) {
      ending.why = "line";
      ending.strength = 1;
      cuts.push({ t: best - 0.15, strength: 4, why: "final", enter: [] });
    }
  }
  // A first voice that comes in almost at once: its entry starts the film.
  const opening: Mark = { t: start, strength: 5, why: "start", enter: [] };
  for (const m of moments) if (m.enter.length && m.t - start < MIN_SHOT) opening.enter.push(...m.enter.filter((h) => !opening.enter.includes(h)));

  // ── what each shot shows ──
  const bounds = [opening, ...cuts];
  const band = music.band;
  const bandIn = (a: number, b: number) => {
    let sum = 0;
    for (const note of band) sum += note.velocity * Math.max(0, Math.min(b, note.t + note.d) - Math.max(a, note.t));
    return sum / Math.max(0.5, b - a);
  };
  const spans = bounds.map((m, k) => {
    const a = k === 0 ? start : m.t;
    const b = k + 1 < bounds.length ? bounds[k + 1].t : Math.max(a + MIN_SHOT, lastSound + 1.5);
    return [a, b] as const;
  });
  const fullness = spans.map(([a, b]) => bandIn(a, b));
  const most = Math.max(1e-6, ...fullness);
  const contexts = spans.map(([a, b], k) => {
    const share = sung.map((s) => covered(s, a, b) / Math.max(0.5, b - a));
    const top = Math.max(...share);
    // who sings: anyone with a fair share of it, the most heard first, the tune (head 0) on a tie
    const heard = (i: number) => Math.round(share[i] * 8);
    const who = share.map((v, i) => (v > 0.12 && v >= 0.35 * top ? i : -1)).filter((i) => i >= 0).sort((x, y) => heard(y) - heard(x) || x - y);
    const energy = band.length ? 0.6 * (who.length / n) + 0.4 * (fullness[k] / most) : who.length / n;
    return { a, b, who, enter: bounds[k].enter.filter((h) => who.includes(h) || bounds[k].enter.length === 1), energy, why: bounds[k].why };
  });
  // The climax: the fullest stretch of the song's second half, the run of it nearest the end
  // (the last verse, the key change), not the ending itself.
  const climax = new Set<number>();
  const late = contexts.slice(0, -1).filter((c) => c.a > 0.4 * lastSound);
  const peak = Math.max(0, ...late.map((c) => c.energy));
  for (let k = contexts.length - 2; k >= 0; k--) {
    const c = contexts[k];
    const full = c.a > 0.4 * lastSound && c.energy >= 0.9 * peak && c.who.length >= Math.min(3, n);
    if (full) climax.add(c.a);
    else if (climax.size) break;
  }
  /** A big move is rationed: no more than a couple, apart, or it stops being big. */
  let heroes = 0;
  let heroAt = -1e9;

  let insideAt = -1e9;
  const history: { kind: ShotKind; who: string }[] = [];
  contexts.forEach((c, k) => {
    const last = k === contexts.length - 1;
    const prev = plan.shots[plan.shots.length - 1];
    const options: [ShotKind, number[], number][] = [];
    const one = c.who[0];
    const pair = c.who.length >= 2 ? pairOf(c.who) : [];
    if (last) options.push(["crane", [], 1]);
    else if (k === 0) options.push(c.enter.length === 1 && c.who.length <= 1 ? ["push", [c.enter[0]], 1] : ["wide", [], 1]);
    else if (!c.who.length) options.push(["wide", [], 2], ["arc", [], 1.5]);
    else if (c.enter.length === 1) {
      const h = c.enter[0];
      if (c.who.length <= 1) options.push(["push", [h], 3], ["profile", [h], 0.6]);
      else if (c.who.length === 2) options.push(["two", ordered(c.who, h), 3], ["push", [h], 1.2]);
      else options.push(["push", [h], 2.5], ["close", [h], 1], ["profile", withNeighbour(h, c.who), 0.8]);
    } else if (c.enter.length > 1) {
      if (c.who.length === 2) options.push(["two", pair, 3]);
      else options.push(["wide", [], 2.5], ["arc", [], 1.2], ["hero", [], climax.has(c.a) ? 2 : 0]);
    } else if (c.who.length === 1) {
      options.push(["close", [one], 2], ["profile", [one], 2], ["arc", [one], 1.6], ["push", [one], 0.4]);
      if (c.energy < 0.6 && c.b - c.a >= 4.5 && c.a - insideAt > 40) options.push(["inside", [one], 1.6]);
    } else if (c.who.length === 2) {
      options.push(["two", pair, 3], ["profile", pair, 2], ["close", [one], 1], ["arc", pair, 1]);
    } else if (climax.has(c.a)) {
      options.push(["hero", [], 3], ["arc", [], 2], ["hero", [one], 1.5], ["close", [one], 1], ["two", pair, 0.8], ["wide", [], 0.8]);
    } else {
      options.push(["wide", [], 2], ["arc", [], 1.6], ["close", [one], 1.2], ["two", pair, 1], ["profile", withNeighbour(one, c.who), 0.9], ["hero", [], c.energy > 0.75 ? 0.4 : 0]);
    }
    // the low angle: at most twice, half a minute apart, never two in a row
    const heroFree = heroes < 2 && c.a - heroAt > 30;
    for (const o of options) if (o[0] === "hero" && !heroFree) o[2] = 0;
    // No shot twice in a row, and what was seen lately is less likely.
    const keyOf = (who: readonly number[]) => [...who].sort().join(",");
    const weights = options.map(([kind, who, w]) => {
      const key = keyOf(who);
      if (options.length > 1 && prev && prev.kind === kind && keyOf(prev.who) === key) return 0;
      let x = w;
      if (prev && prev.kind === kind) x *= 0.25;
      history.slice(-4).forEach((h) => {
        if (h.kind === kind) x *= 0.6;
        if (h.kind === kind && h.who === key) x *= 0.5;
      });
      return x;
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let pick = 0;
    if (total > 0) {
      let r = rng() * total;
      for (pick = 0; pick < options.length - 1 && r >= weights[pick]; pick++) r -= weights[pick];
    } else rng();
    const [kind, who] = options[pick];
    if (kind === "inside") insideAt = c.a;
    if (kind === "hero") {
      heroes++;
      heroAt = c.a;
    }
    // Into a new voice, a new section, the band alone: a cut. Along a section the camera mostly
    // glides on, and into the ending it always does, rising out of the shot before.
    const strong = c.why === "entry" || c.why === "section" || c.why === "band";
    let cut = k === 0 || (!last && (strong || rng() < 0.45));
    const side: 1 | -1 = prev && rng() < 0.7 ? (-prev.side as 1 | -1) : rng() < 0.5 ? 1 : -1;
    const shot: Shot = { t0: c.a, t1: c.b, kind, who: [...who], cut, side, why: c.why };
    // A move too big to glide gently in the time the shot gives it is a cut instead.
    if (!cut && prev && glideFor(prev, shot, plan.strength) === null) cut = shot.cut = true;
    plan.shots.push(shot);
    history.push({ kind, who: keyOf(who) });
  });
  // The climax gets its big move even if chance passed it over: the first climax shot becomes the hero.
  if (climax.size && !plan.shots.some((s) => s.kind === "hero")) {
    const s = plan.shots.find((s) => climax.has(s.t0));
    if (s) {
      s.kind = "hero";
      s.who = [];
    }
  }
  return plan;
}

/** Two voices of those singing: the two most heard. */
const pairOf = (who: number[]) => [who[0], who[1]];
/** The voice first, then the others. */
const ordered = (who: number[], first: number) => [first, ...who.filter((h) => h !== first)];
/** A voice and the one beside it that also sings (the next along), for a profile facing it. */
function withNeighbour(h: number, who: number[]): number[] {
  const others = who.filter((x) => x !== h).sort((a, b) => Math.abs(a - h) - Math.abs(b - h) || b - a);
  return others.length ? [h, others[0]] : [h];
}

// ── the camera through a shot ──

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ease = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
};

/** Where the shot has the camera `u` (0..1) of the way through it: the pose alone, before any glide in. */
function within(shot: Shot, u: number, a: number, out: Take): void {
  const e = ease(u);
  const s = shot.side;
  const group = shot.who.length === 0;
  out.detail = 0;
  out.pivot = group ? 0 : 1;
  out.toward = group ? 0 : 1;
  // The eye's turn: 0 sees the heads three-quarters on (as they stand), about -0.75 side on (the
  // airway whole), about +0.8 face on. A close shot is taken from the front or from the side,
  // which as chance has it (`side`).
  const front = s > 0;
  switch (shot.kind) {
    case "wide":
      out.yaw = 0.08 + s * a * (-0.14 + 0.28 * e);
      out.pitch = 0.08 - 0.04 * e;
      out.tight = -0.12 + 0.1 * e;
      break;
    case "push":
      out.yaw = (front ? 0.4 : -0.35) + s * a * 0.1 * (1 - e);
      out.pitch = 0.05 * (1 - e);
      out.tight = 0.2 + 0.75 * e;
      break;
    case "close":
      out.yaw = (front ? 0.55 : -0.5) + s * a * (0.05 - 0.1 * e);
      out.pitch = 0.03;
      out.tight = 0.85 + 0.1 * e;
      break;
    case "two":
      out.yaw = 0.22 + s * a * (-0.08 + 0.16 * e);
      out.pitch = 0.04;
      out.tight = 0.75 + 0.18 * e;
      break;
    case "profile":
      // side on, facing the voice it sings with, drifting a touch toward the face
      out.yaw = -0.66 + a * 0.1 * e;
      out.pitch = 0.03;
      out.tight = 0.8 + 0.12 * e;
      break;
    case "arc":
      // round from the side to the front (or back), a quarter of a circle as the shot goes
      out.yaw = 0.02 + s * a * (group ? 0.36 : 0.5) * (2 * e - 1);
      out.pitch = 0.09 - 0.06 * e;
      out.tight = group ? -0.06 + 0.08 * e : 0.7 + 0.12 * e;
      break;
    case "hero":
      // from below, looking up, pushing slowly in
      out.yaw = 0.2 + s * a * (0.1 - 0.2 * e);
      out.pitch = -0.28 - 0.12 * a * e;
      out.tight = group ? -0.04 + 0.08 * e : 0.55 + 0.25 * e;
      break;
    case "crane":
      // over the last chord the eye rises and draws back from the choir
      out.yaw = 0.1 + s * a * 0.15 * e;
      out.pitch = -0.08 + 0.75 * a * smooth(u);
      out.tight = 0.1 - 0.34 * e;
      out.toward = 0;
      out.pivot = 0;
      break;
    case "inside":
      // side on, into the mouth and the throat where the voice is seen
      out.yaw = -0.66 + a * 0.06 * e;
      out.pitch = 0.02;
      out.tight = 0.85 + 0.15 * e;
      out.detail = smooth(Math.min(1, u * 1.6));
      break;
  }
  out.focus.fill(0);
  if (!group) {
    // A profile faces the voice it is with: that one has a smaller share of the frame.
    const shares = shot.kind === "profile" && shot.who.length > 1 ? [0.7, 0.3] : shot.who.map(() => 1 / shot.who.length);
    shot.who.forEach((h, i) => (out.focus[h] = (out.focus[h] ?? 0) + (shares[i] ?? 0)));
  }
}

export function makeTake(): Take {
  return { yaw: 0, pitch: 0, tight: 0, toward: 0, pivot: 0, detail: 0, focus: new Float32Array(8) };
}

/** Which shot is up at t. */
export function shotAt(plan: Plan, t: number): number {
  const s = plan.shots;
  let i = 0;
  while (i + 1 < s.length && s[i + 1].t0 <= t) i++;
  return i;
}

const spare = makeTake();
const spare2 = makeTake();

/** How motion strength becomes the size of a move. */
const amplitude = (strength: number) => 0.55 + 0.65 * Math.max(0, Math.min(1, strength));

/**
 * Seconds the camera takes to glide from the end of `before` into `shot`: long enough that the
 * eye never turns faster than GLIDE_TURN, or null when that would take more than the shot can give.
 */
function glideFor(before: Shot, shot: Shot, strength: number): number | null {
  const a = amplitude(strength);
  within(before, 1, a, spare2);
  within(shot, 0, a, spare);
  // smootherstep's quickest is 15/8 of its mean speed
  const turn = Math.max(Math.abs(spare.yaw - spare2.yaw), Math.abs(spare.pitch - spare2.pitch), 0.5 * Math.abs(spare.tight - spare2.tight));
  const need = Math.max(GLIDE, (1.875 * turn) / GLIDE_TURN);
  return need <= GLIDE_SHARE * (shot.t1 - shot.t0) ? need : null;
}

/** The camera at time t (seconds on the performance's clock), written into `out`. */
export function takeAt(plan: Plan, t: number, out: Take): void {
  const a = amplitude(plan.strength);
  const i = shotAt(plan, t);
  const shot = plan.shots[i];
  const progress = (x: Shot, at: number) => (at - x.t0) / Math.max(1, x.t1 - x.t0);
  within(shot, progress(shot, t), a, out);
  // Gliding in: from where the last shot left the camera, eased so neither end jerks.
  if (!shot.cut && i > 0) {
    const before = plan.shots[i - 1];
    const glide = glideFor(before, shot, plan.strength) ?? GLIDE;
    const k = smooth((t - shot.t0) / glide);
    if (k < 1) {
      within(before, 1, a, spare);
      out.yaw = spare.yaw + (out.yaw - spare.yaw) * k;
      out.pitch = spare.pitch + (out.pitch - spare.pitch) * k;
      out.tight = spare.tight + (out.tight - spare.tight) * k;
      out.toward = spare.toward + (out.toward - spare.toward) * k;
      out.pivot = spare.pivot + (out.pivot - spare.pivot) * k;
      out.detail = spare.detail + (out.detail - spare.detail) * k;
      for (let h = 0; h < out.focus.length; h++) out.focus[h] = spare.focus[h] + (out.focus[h] - spare.focus[h]) * k;
    }
  }
  // The hand that holds the camera: a slow drift of a few hundredths of a radian, seeded.
  const p = (plan.seed % 1000) * 0.37;
  const TAU = Math.PI * 2;
  out.yaw += a * 0.009 * (Math.sin((TAU * t) / 6.7 + p) + 0.5 * Math.sin((TAU * t) / 3.3 + 2 * p));
  out.pitch += a * 0.006 * (Math.sin((TAU * t) / 5.3 + 3 * p) + 0.5 * Math.sin((TAU * t) / 3.9 + p));
  out.tight += 0.012 * a * Math.sin((TAU * t) / 8.1 + 5 * p);
}

/** Is t the first instant of a shot that is cut into (so the view frames it at once)? `was` is the time of the frame before. */
export function cutBetween(plan: Plan, was: number, t: number): boolean {
  if (!(t > was)) return false;
  const a = shotAt(plan, was);
  const b = shotAt(plan, t);
  if (a === b) return false;
  for (let k = a + 1; k <= b; k++) if (plan.shots[k].cut) return true;
  return false;
}
