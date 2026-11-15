// The performer: a Score becomes movement.
//
// The plan is made once, when perform() is called, as a list of moments at which each pose value
// is aimed somewhere new. While rendering, the voice only looks up where each value is aimed
// now; the body's inertia (inertia.ts) makes the movement.
//
// Two layers, after Öhman (1966): the vowels flow into each other underneath, and each consonant
// borrows the parts it needs for a while on top.
//
// Timing follows the contract's Phone comment: what a listener hears as the start of a sound
// lands on its slot's `t`. A part needs time to get anywhere, so every aim is set early by the
// time that part takes to cover the distance (timeToCover):
//   a vowel        the tongue and jaw leave for it when the consonants before it begin, so the
//                  consonant lets go into a mouth already shaped; its voice arrives on t.
//   a stop         the mouth shuts on t. It lets go `puff` before the slot ends: the burst, then
//                  breath until the folds, which were held apart, close and the next voice
//                  starts as the slot ends. A voiced stop lets go just before the end.
//   a fricative    the gap is formed and the folds apart by t; the hiss lasts the slot.
//   a nasal        the velum opens ahead and the mouth shuts on t.
//   a rest         everything relaxes, the folds part, and if there is time the lungs fill.
import { POSE, POSE_COUNT, POSE_KEYS, REST } from "../contract.ts";
import type { Body, PhoneSymbol, Point, PoseKey, Score } from "../contract.ts";
import { RATE, timeToCover } from "./inertia.ts";
import { isVowel, SEALED, SHUT, soundOf, vowelPose } from "./phones.ts";
import type { Maker, Sound } from "./phones.ts";
import { newAirway, REFERENCE_TRACT, shapeAirway } from "./shape.ts";
import { SECTIONS } from "./tube.ts";

export interface Plan {
  /** Length of the score in seconds. */
  length: number;
  /** Fill `goal` with where every pose value is aimed at score time `t`; returns the index of the phone sounding, or -1. */
  aim(t: number, goal: Float64Array): number;
}

// ── how the folds are held ──
const VOICE = 0.5;
/** Apart for a voiceless consonant: wide enough that they stop, not so wide the breath is lost. */
const APART = 0.85;
/** Loosened for a voiced fricative: voice and a stream of air together. */
const LOOSE = 0.65;
const BREATHY = 0.78;
/** The folds stop about this long after being aimed apart, and start this long after being aimed together. */
const TO_STOP_VOICE = 0.028;
const TO_START_VOICE = 0.03;

// ── the velum ──
const NOSE_SHUT = -0.15;
const NOSE_OPEN = 0.75;

// ── the pitch ──
/** A part following a steadily moving aim on its critically damped spring trails it by 2/rate
 *  (inertia.ts). The pitch is read that far ahead, so a sung note arrives when the score says it
 *  does rather than some 20 ms late. */
const PITCH_LEAD = 2 / RATE.pitch;

// ── the breath, when the score leaves it to the voice ──
const BREATH = 0.55;
const BREATHE_IN = -0.22;
/** How long the voice takes to die away once the breath stops at the end of a phrase. A sound that
 *  ends the phrase holds its shape that long: a mouth opening under a fading voice adds a vowel
 *  (an n that lets go becomes "nuh"). */
const FADE = 0.1;

/** Seconds of breath after a voiceless stop's burst before the voice starts (voice onset time).
 *  English values after Lisker & Abramson (1964): long before a stressed vowel, short elsewhere,
 *  shortest after s; k longer than t longer than p. */
function puff(sound: Sound, ph: PhoneSymbol, stress: number | undefined, afterHiss: boolean, intoVoice: boolean): number {
  if (sound.voiced) return 0.012;
  if (!intoVoice) return 0.02;
  if (afterHiss) return 0.018;
  const base = stress === 1 ? 0.06 : stress === 0 ? 0.03 : 0.045;
  return base + (ph === "k" ? 0.01 : ph === "p" ? -0.005 : 0);
}

interface Item {
  ph: PhoneSymbol;
  t: number;
  d: number;
  stress?: number;
  /** Index in the score's phones, or -1 for a gap. */
  index: number;
  sound: Sound;
}

/** One pose value's two layers. */
class Track {
  baseAt: number[] = [-1e9];
  baseTo: number[];
  /** Times a consonant holds this value: from a to b at v. */
  holds: { a: number; b: number; v: number }[] = [];

  constructor(rest: number) {
    this.baseTo = [rest];
  }

  /** From `t` on the vowels aim this value at `v`. */
  base(t: number, v: number): void {
    const last = this.baseAt[this.baseAt.length - 1];
    this.baseAt.push(t > last ? t : last);
    this.baseTo.push(v);
  }

  /** Where the vowels have it aimed at time t. */
  under(t: number): number {
    let i = this.baseAt.length - 1;
    while (i > 0 && this.baseAt[i] > t) i--;
    return this.baseTo[i];
  }

  hold(a: number, b: number, v: number): void {
    if (b > a) this.holds.push({ a, b, v });
  }

  /** Both layers flattened into moments, in time order: [times, values]. */
  flatten(): [Float64Array, Float64Array] {
    // A later consonant takes a part over from an earlier one.
    const holds = this.holds.sort((p, q) => p.a - q.a);
    for (let i = 0; i + 1 < holds.length; i++) if (holds[i].b > holds[i + 1].a) holds[i].b = holds[i + 1].a;
    const times: number[] = [];
    const values: number[] = [];
    let h = 0;
    let held = -Infinity;
    for (let i = 0; i < this.baseAt.length; i++) {
      const next = i + 1 < this.baseAt.length ? this.baseAt[i + 1] : Infinity;
      if (this.baseAt[i] >= held) {
        times.push(this.baseAt[i]);
        values.push(this.baseTo[i]);
      }
      while (h < holds.length && holds[h].a < next) {
        const { a, b, v } = holds[h++];
        if (b <= a) continue;
        times.push(a);
        values.push(v);
        held = b;
        if (h < holds.length && holds[h].a <= b) continue;
        times.push(b);
        values.push(this.under(b));
      }
    }
    // Stable order by time.
    const order = times.map((_, i) => i).sort((p, q) => times[p] - times[q] || p - q);
    return [Float64Array.from(order, (i) => times[i]), Float64Array.from(order, (i) => values[i])];
  }
}

const scratch = newAirway();
const scratchPose = new Float64Array(POSE_COUNT);

/** The pose value of `maker` that leaves the narrowest place `want` cm² wide, the rest of the pose given. */
function narrowTo(pose: Float64Array, maker: Maker, want: number, body: Body): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    pose[POSE[maker]] = mid;
    shapeAirway(pose, body, scratch);
    let narrow = scratch.area[SECTIONS - 1];
    if (maker !== "lips") {
      narrow = Infinity;
      const from = maker === "tip" ? Math.round(0.78 * SECTIONS) : 6;
      const to = maker === "tip" ? SECTIONS - 3 : SECTIONS - 4;
      for (let j = from; j <= to; j++) if (scratch.area[j] < narrow) narrow = scratch.area[j];
    }
    // Lips open as their value rises; the tongue closes as its value rises.
    if (narrow > want === (maker === "lips")) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Time before a part aimed from `from` to `to` passes `cross`. */
function lead(from: number, to: number, cross: number, key: PoseKey): number {
  const whole = to - from;
  if (Math.abs(whole) < 1e-6) return 0;
  return timeToCover((cross - from) / whole, RATE[key]);
}

function isObstruent(sound: Sound): boolean {
  return sound.manner === "stop" || sound.manner === "fricative" || sound.manner === "affricate";
}

/** The score's phones with every gap made an explicit rest, and rests before and after. */
function itemsOf(score: Score, body: Body): Item[] {
  const items: Item[] = [];
  let at = -1;
  const rest = (t: number, d: number) => items.push({ ph: "_", t, d, index: -1, sound: soundOf("_", body) });
  score.phones.forEach((p, index) => {
    if (!(p.d > 0) || !Number.isFinite(p.t)) return;
    const t = p.t > at ? p.t : at;
    if (t - at > 0.03) rest(at, t - at);
    const end = Math.max(t + 0.001, p.t + p.d);
    items.push({ ph: p.ph, t, d: end - t, stress: p.stress, index, sound: soundOf(p.ph, body) });
    at = end;
  });
  rest(at, Math.max(1, score.length - at + 1));
  return items;
}

export function plan(score: Score, body: Body): Plan {
  const items = itemsOf(score, body);
  const tracks = POSE_KEYS.map((k) => new Track(REST[k]));
  const track = (k: PoseKey) => tracks[POSE[k]];
  const size = (body.tract / REFERENCE_TRACT) ** 2;
  const breath: Point[] = [{ t: -1e9, v: 0 }];

  const mannerAt = (i: number) => (i >= 0 && i < items.length ? items[i].sound.manner : "rest");

  // ── the vowels underneath ──
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const before = mannerAt(i - 1);
    if (it.sound.manner === "rest") {
      // Let the last sound finish, then let everything go.
      for (const k of ["jaw", "tongueX", "tongueY", "tip", "tipX", "lips", "round", "larynx", "lateral"] as const) track(k).base(it.t + 0.03, REST[k]);
      track("glottis").base(it.t + 0.03, REST.glottis);
      track("velum").base(it.t + 0.06, REST.velum);
      continue;
    }
    if (before === "rest") {
      // Coming out of a rest: shut the nose and bring the folds together before the breath rises.
      track("velum").base(it.t - 0.08, NOSE_SHUT);
      track("glottis").base(it.t - 0.09, VOICE);
      track("lateral").base(it.t - 0.09, 0);
    }
    if (it.sound.manner !== "vowel") continue;
    // When the tongue leaves for this vowel: as the consonants before it begin.
    let leave = it.t - 0.045;
    if (before === "rest") leave = it.t - 0.1;
    else if (before !== "vowel") {
      let first = i - 1;
      while (mannerAt(first - 1) !== "vowel" && mannerAt(first - 1) !== "rest") first--;
      leave = Math.min(leave, Math.max(items[first].t, it.t - 0.25));
      if (mannerAt(first - 1) === "rest") leave = Math.min(leave, items[first].t - 0.06);
    }
    const pose = vowelPose(it.ph, body);
    for (const k in pose) track(k as PoseKey).base(leave, pose[k as PoseKey]!);
  }

  // ── the consonants on top ──
  /** Shut `maker` from `from` until `until` (both as heard). */
  const shut = (maker: Maker, from: number, until: number, thenTo?: number) => {
    const tr = track(maker);
    const early = lead(tr.under(from), SHUT[maker], SEALED[maker], maker);
    const late = lead(SHUT[maker], thenTo ?? tr.under(until + 0.03), SEALED[maker], maker);
    tr.hold(from - early, until - late, SHUT[maker]);
    return until - late;
  };
  /** The pose value that gives this sound's gap, in the mouth the vowels and the sound's own settings leave. */
  const gapValue = (sound: Sound, when: number, set: Partial<Record<PoseKey, number>>) => {
    for (let k = 0; k < POSE_COUNT; k++) scratchPose[k] = Math.min(1, Math.max(0, tracks[k].under(when)));
    for (const k in set) scratchPose[POSE[k as PoseKey]] = set[k as PoseKey]!;
    return narrowTo(scratchPose, sound.maker!, sound.gap! * size, body);
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const { sound } = it;
    const manner = sound.manner;
    if (manner === "vowel" || manner === "rest") continue;
    const s = it.t;
    const e = it.t + it.d;
    const next = items[i + 1];
    const before = mannerAt(i - 1);
    const nextSound = next.sound;
    const intoVoice = nextSound.voiced;
    const fromRest = before === "rest";
    const last = nextSound.manner === "rest";
    // When a sound that is held open (not a stop's burst) lets go.
    const hush = last ? e + FADE : e;
    // After a rest nothing is heard yet, so the mouth takes its place early: the voice must
    // start into the consonant, not into a stray vowel before it.
    const form = fromRest ? s - 0.06 : s;

    // What the sound insists on beside its closure or gap. Velars follow the neighbouring vowel.
    const set: Partial<Record<PoseKey, number>> = { ...sound.set };
    if (sound.slides) {
      const lean = track("tongueX").under(e + 0.05) - 0.5;
      set.tongueX = Math.min(0.85, Math.max(0.5, set.tongueX! + 0.4 * lean));
    }
    if (set.jaw !== undefined && manner !== "fricative" && manner !== "affricate") {
      set.jaw = 0.75 * set.jaw + 0.25 * track("jaw").under(s);
    }

    let release = e;
    if (manner === "stop" || manner === "affricate") {
      const afterHiss = before === "fricative" && !items[i - 1].sound.voiced;
      const stress = it.stress ?? (nextSound.manner === "vowel" ? next.stress : undefined);
      let after = manner === "affricate" ? Math.min(0.09, Math.max(0.04, 0.45 * it.d)) : puff(sound, it.ph, stress, afterHiss, intoVoice);
      // Keep at least 40 ms of closure, or two thirds of a very short slot.
      after = Math.min(after, Math.max(it.d - 0.04, it.d / 3));
      release = e - after;
      if (manner === "affricate") {
        const hiss = soundOf(sound.into!, body);
        const gap = gapValue({ ...hiss, set }, s, set);
        const opened = shut(sound.maker!, form, release, gap);
        track(sound.maker!).hold(opened, e - 1 / RATE[sound.maker!], gap);
      } else {
        shut(sound.maker!, form, release);
      }
    } else if (manner === "nasal") {
      shut(sound.maker!, form, hush);
      track("velum").hold(s - 0.05, last ? hush : e - (isObstruent(nextSound) ? 0.05 : 0.03), NOSE_OPEN);
    } else if (manner === "lateral") {
      shut(sound.maker!, form, hush);
    } else if (manner === "fricative" || (manner === "approximant" && sound.maker)) {
      const maker = sound.maker!;
      track(maker).hold(form - 3 / RATE[maker], hush - 1 / RATE[maker], gapValue(sound, s, set));
    } else if (manner === "trill") {
      // The tip beats against the ridge about 27 times a second (Ladefoged & Maddieson 1996).
      const beat = 1 / 27;
      let at = s;
      do {
        shut("tip", at, at + 0.016, 0.45);
        track("tip").hold(at + 0.016, Math.min(e, at + beat) - 0.008, 0.45);
        at += beat;
      } while (at + 0.016 <= e);
    } else if (manner === "tap") {
      shut("tip", s, Math.min(e, s + 0.022));
    }

    // The settings that go with it, a little ahead and until it lets go.
    for (const k in set) {
      const key = k as PoseKey;
      if (key === sound.maker) continue;
      const ahead = key === "tongueX" || key === "tongueY" || key === "jaw" ? 0.08 : 0.05;
      track(key).hold(form - ahead, last && release === e ? hush : manner === "approximant" || manner === "lateral" ? e - 0.02 : release, set[key]!);
    }

    // The folds.
    if (manner === "breath") track("glottis").hold(s - (fromRest ? 0.12 : 0.03), e - TO_START_VOICE, BREATHY);
    else if (manner === "catch") track("glottis").hold(s - 0.02, e - 0.015, 0.02);
    else if (isObstruent(sound)) {
      if (!sound.voiced) track("glottis").hold(s - (fromRest ? 0.12 : TO_STOP_VOICE), intoVoice ? e - TO_START_VOICE : e, APART);
      else if (manner !== "stop") track("glottis").hold(s - 0.02, e - 0.02, LOOSE);
    }
  }

  // ── the breath ──
  if (!score.lungs) {
    let i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.sound.manner === "rest") {
        if (it.d >= 0.4 && i > 0 && i < items.length - 1) {
          breath.push({ t: it.t + 0.1, v: 0 }, { t: it.t + 0.16, v: BREATHE_IN }, { t: it.t + it.d - 0.2, v: BREATHE_IN }, { t: it.t + it.d - 0.14, v: 0 });
        }
        i++;
        continue;
      }
      // A phrase: every sound up to the next rest.
      let last = i;
      while (items[last + 1].sound.manner !== "rest") last++;
      const first = it;
      const begin = first.sound.voiced ? first.t - 0.04 : first.sound.manner === "fricative" || first.sound.manner === "breath" ? first.t - 0.06 : first.t - 0.02;
      const end = items[last].t + items[last].d;
      // A phrase starts a little strong and sinks as the lungs empty (declination).
      const level = (t: number) => BREATH * (1.04 - (0.12 * (t - begin)) / Math.max(0.3, end - begin));
      breath.push({ t: begin - 0.001, v: 0 }, { t: begin, v: level(begin) });
      for (let j = i; j <= last; j++) {
        const v = items[j];
        if (v.sound.manner !== "vowel" || v.stress === undefined) continue;
        // A stressed syllable is a push of breath; an unstressed one eases off.
        const push = v.stress === 1 ? 0.07 : v.stress === 2 ? 0.035 : -0.03;
        const stop = v.t + v.d;
        breath.push({ t: v.t - 0.03, v: level(v.t - 0.03) }, { t: v.t + 0.02, v: level(v.t) + push });
        breath.push({ t: Math.max(v.t + 0.021, stop - 0.04), v: level(stop) + push }, { t: stop, v: level(stop) });
      }
      breath.push({ t: end, v: level(end) }, { t: end + 0.001, v: 0 });
      i = last + 1;
    }
    breath.sort((p, q) => p.t - q.t);
  }

  return new Performance(score, items, tracks.map((t) => t.flatten()), score.lungs ?? breath, body);
}

/** A curve through breakpoints, read forward in time. */
class Curve {
  private at = 0;
  private t: Float64Array;
  private v: Float64Array;

  constructor(points: Point[], fallback: number, private log: boolean) {
    const sorted = points.length ? points : [{ t: 0, v: fallback }];
    this.t = Float64Array.from(sorted, (p) => p.t);
    this.v = Float64Array.from(sorted, (p) => (log ? Math.log(Math.max(1, p.v)) : p.v));
  }

  read(time: number): number {
    const { t, v } = this;
    if (time < t[this.at]) this.at = 0;
    while (this.at + 1 < t.length && t[this.at + 1] <= time) this.at++;
    const i = this.at;
    let out = v[i];
    if (time > t[i] && i + 1 < t.length) out += ((v[i + 1] - v[i]) * (time - t[i])) / (t[i + 1] - t[i]);
    return this.log ? Math.exp(out) : out;
  }
}

class Performance implements Plan {
  readonly length: number;
  private cursor = new Int32Array(POSE_COUNT);
  private lungs: Curve;
  private pitch: Curve;
  private vibrato: Curve;
  private register: Curve;
  private quality: Curve | null;
  private starts: Float64Array;
  private ends: Float64Array;
  private indices: Int32Array;
  private phone = 0;
  private last = -Infinity;

  constructor(score: Score, items: Item[], private moments: [Float64Array, Float64Array][], lungs: Point[], body: Body) {
    this.length = score.length;
    this.lungs = new Curve(lungs, 0, false);
    // No pitch written: the body's own speaking pitch.
    this.pitch = new Curve(score.pitch, 250 - 140 * body.folds, true);
    this.vibrato = new Curve(score.vibrato ?? [], 0, false);
    this.register = new Curve(score.register ?? [], 0, false);
    this.quality = score.glottis?.length ? new Curve(score.glottis, VOICE, false) : null;
    const sounds = items.filter((it) => it.index >= 0);
    this.starts = Float64Array.from(sounds, (it) => it.t);
    this.ends = Float64Array.from(sounds, (it) => it.t + it.d);
    this.indices = Int32Array.from(sounds, (it) => it.index);
  }

  aim(t: number, goal: Float64Array): number {
    if (t < this.last) {
      this.cursor.fill(0);
      this.phone = 0;
    }
    this.last = t;
    const { moments, cursor } = this;
    for (let k = 0; k < POSE_COUNT; k++) {
      const times = moments[k][0];
      let c = cursor[k];
      while (c + 1 < times.length && times[c + 1] <= t) c++;
      cursor[k] = c;
      goal[k] = moments[k][1][c];
    }
    goal[POSE.lungs] = this.lungs.read(t);
    goal[POSE.pitch] = this.pitch.read(t + PITCH_LEAD);
    goal[POSE.vibrato] = this.vibrato.read(t);
    goal[POSE.register] = this.register.read(t);
    // The score's voice quality replaces the ordinary voicing setting, and only that: a voiceless
    // consonant still opens the folds, a glottal stop still shuts them.
    if (this.quality && goal[POSE.glottis] === VOICE) goal[POSE.glottis] = this.quality.read(t);

    const { starts, ends } = this;
    while (this.phone < starts.length && ends[this.phone] <= t) this.phone++;
    return this.phone < starts.length && starts[this.phone] <= t ? this.indices[this.phone] : -1;
  }
}

export { isVowel };
