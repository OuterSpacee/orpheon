/**
 * The band's parts, written from a tune's chords, beat and bar (harmony.ts) the way a session
 * player would read a lead sheet: the bass on roots and fifths with a passing note into the next
 * chord, strings holding voiced chords, the harp rolling arpeggios, the guitar strumming (or
 * picking a slow song), the piano with chords over a bass hand, the flute answering the tune in
 * its rests and doubling it an octave up in the last verse, the timpani marking cadences, the kit
 * keeping a pattern for the meter, the tanpura's drone of tonic and fifth, the sarod's low note and
 * broken chord, the esraj's two held notes, and the tabla playing a theka for the meter (keherwa in
 * four, dadra in three).
 *
 * A band that plays everything it can from the first bar to the last buries the song. So, as an
 * arranger would:
 *
 *   - It can play an introduction: the tune's last phrase on the lead instrument (the first of
 *     flute, harp, piano, guitar, strings in the band) over that phrase's chords, while the voices
 *     wait (Frame.intro and Frame.start).
 *   - It grows through the song (intensity()): sparse in the introduction and the first phrase
 *     (the bass on the chord's root, a chord rolled or held once, no drums), moving from the
 *     second phrase, full in the last verse.
 *   - Its held chords stay under the tune (a third below its lowest note there), so the words sit
 *     on top and the band does not sing in their place.
 *   - It ends together: the last chord rolled up and left to ring after the voices stop.
 *
 * Everything is written in seconds on the tune's own clock.
 */
import { type BandNote, type BandPart, INSTRUMENTS, type InstrumentId } from "../contract.ts";
import { PLAYABLE, pitchNear } from "../band/ranges.ts";
import type { NoteIn } from "./index.ts";
import { type Chord, chordAt, type Key, type Phrase, pc } from "./harmony.ts";

/** What the parts are written from. */
export interface Frame {
  key: Key;
  /** seconds a beat, beats a bar, the voices' first downbeat, and how a beat divides */
  beat: number;
  meter: number;
  downbeat: number;
  division: 2 | 3;
  chords: readonly Chord[];
  phrases: readonly Phrase[];
  /** the tune, as it is sung */
  tune: readonly NoteIn[];
  /** the end of the last sung note */
  end: number;
  /** the other instruments playing (a guitar strums with a kit, picks without one) */
  band: readonly InstrumentId[];
  /** where the band begins, on a bar line: the first downbeat unless there is an introduction */
  start?: number;
  /** the tune the lead instrument plays in the introduction, before `downbeat` */
  intro?: readonly NoteIn[];
  /** every line the choir sings, when there is more than the tune (a round, written parts) */
  sung?: readonly (readonly NoteIn[])[];
  /** A staged performance's fullness at t, 0 (the tune alone) to 1 (everyone sings): the band grows with it. */
  energy?: (t: number) => number;
  /** A staged performance's texture at t: the men or the women alone take a band that suits them. */
  texture?: (t: number) => "all" | "men" | "women";
}

/**
 * In a staged performance each family plays while the singing is full enough for it, as the
 * owner's hand-made arrangements do: the low line and the drone with the first voice, the plucked
 * and struck chords once a second voice sings, the held chords and the flute with the third,
 * the drums while the choir is whole. So the band thins with a lighter phrase and comes back
 * with the choir; and under the women alone the low instruments and drums rest, under the men
 * the flute.
 */
const ENTERS: Record<InstrumentId, number> = {
  bass: 0, tanpura: 0, harp: 0.3, guitar: 0.3, piano: 0.3, sarod: 0.3, strings: 0.6, esraj: 0.6, flute: 0.6, timpani: 0.99, kit: 0.99, tabla: 0.99,
};

const LOW_END = new Set<InstrumentId>(["bass", "tanpura", "timpani", "kit", "tabla"]);

/** Does the instrument play at t, in a staged performance? (Always, in any other.) */
export function plays(id: InstrumentId, t: number, energy?: (t: number) => number, texture?: (t: number) => "all" | "men" | "women"): boolean {
  if (!energy) return true;
  if (energy(t + 1e-3) < ENTERS[id] - 1e-9) return false;
  const tex = texture?.(t + 1e-3);
  if (tex === "women" && LOW_END.has(id)) return false;
  if (tex === "men" && id === "flute") return false;
  return true;
}

/** An instrument's notes in the spans it plays: those that start where it rests go, those that ring into a rest stop there. */
export function follow(notes: readonly BandNote[], id: InstrumentId, beat: number, energy?: (t: number) => number, texture?: (t: number) => "all" | "men" | "women"): BandNote[] {
  if (!energy) return [...notes];
  const out: BandNote[] = [];
  for (const n of notes) {
    if (!plays(id, n.t, energy, texture)) continue;
    let d = n.d;
    for (let t = n.t + beat / 2; t < n.t + n.d; t += beat / 2) {
      if (!plays(id, t, energy, texture)) {
        d = t - n.t;
        break;
      }
    }
    out.push(d === n.d ? n : { ...n, d });
  }
  return out;
}

/** The instruments that fill in chords: a note of theirs may be left out, the chord still heard. */
const FILLING = new Set<InstrumentId>(["strings", "harp", "guitar", "piano", "sarod", "esraj"]);

/**
 * A chord note a semitone from a note being sung as it is struck rubs against the voice (a
 * passing note of the tune against the chord, or in a round one voice's against another's
 * chord). An accompanist leaves that note out; the chord's other notes carry it.
 */
function clear(notes: BandNote[], sung: readonly (readonly NoteIn[])[], beat: number): BandNote[] {
  const all = sung.flat();
  return notes.filter((n) => {
    const until = n.t + Math.min(n.d, beat);
    return !all.some((v) => v.t < until && n.t < v.t + v.d && [1, 11].includes(Math.abs(v.midi - n.midi) % 12));
  });
}

/**
 * How loud each instrument sits in the band, and where it stands (-1 left .. 1 right). The levels
 * put each instrument 9 to 12 dB under the voice that sings the tune and the whole band about 8 dB
 * under the choir (rendered and measured in tests/app/band-blend.test.ts): under the words, as an
 * accompanist plays.
 */
const MIX: Record<InstrumentId, { level: number; place: number }> = {
  bass: { level: 0.57, place: 0 },
  strings: { level: 0.25, place: -0.45 },
  harp: { level: 0.5, place: 0.5 },
  guitar: { level: 0.76, place: 0.35 },
  piano: { level: 0.78, place: -0.25 },
  flute: { level: 0.33, place: 0.25 },
  timpani: { level: 0.25, place: -0.6 },
  kit: { level: 0.9, place: 0.1 },
  tanpura: { level: 0.2, place: -0.3 },
  tabla: { level: 0.51, place: 0.3 },
  sarod: { level: 0.57, place: -0.45 },
  esraj: { level: 0.18, place: -0.1 },
};

/** The instruments that can carry the tune in the introduction, first choice first. */
const LEADS: InstrumentId[] = ["flute", "harp", "piano", "guitar", "strings"];

/** Where each lead plays the tune: the middle of the octaves it is moved into. */
const LEAD_CENTRE: Partial<Record<InstrumentId, number>> = { flute: 79, harp: 72, piano: 72, guitar: 64, strings: 74 };

/** Seconds the last chord rings after the voices stop. */
const RING = 1.6;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 11];

const startOf = (f: Frame): number => f.start ?? f.downbeat;
const barOf = (f: Frame): number => f.meter * f.beat;

/** Bar starts from where the band begins to the end. */
function bars(f: Frame): number[] {
  const out: number[] = [];
  const bar = barOf(f);
  for (let t = startOf(f); t < f.end - 0.05 * f.beat; t += bar) out.push(t);
  return out;
}

/** The bar line nearest t. */
const snap = (f: Frame, t: number): number => f.downbeat + Math.round((t - f.downbeat) / barOf(f)) * barOf(f);

/** Where the last verse starts: the last time the first phrase comes back, or the last two phrases; a tune of one or two phrases has none (its end). */
function lastVerse(f: Frame): number {
  const ph = f.phrases;
  if (ph.length < 3) return f.end;
  const shape = (p: Phrase) => f.tune.slice(p.first, p.last + 1).map((n) => n.midi).join(",");
  const first = shape(ph[0]);
  for (let i = ph.length - 1; i > 0; i--) if (shape(ph[i]) === first && i >= ph.length / 2) return ph[i].t;
  return ph[Math.max(1, ph.length - 2)].t;
}

/**
 * How fully the band plays at t: 0 in the introduction and the first phrase, 1 from the second
 * phrase, 2 in the last verse. Sections change on the bar line nearest a phrase's start, so a
 * pickup does not cut a bar in two.
 */
function intensity(f: Frame, t: number): 0 | 1 | 2 {
  if (t < f.downbeat - 1e-6) return 0;
  if (f.energy) {
    // staged: as full as the singing (a little ahead of it, so the band leads into a fuller phrase)
    const e = f.energy(t + 1e-3);
    return e < 0.34 ? 0 : e < 0.99 ? 1 : 2;
  }
  const ph = f.phrases;
  if (ph.length < 2) return 1;
  if (t < snap(f, ph[1].t) - 1e-6) return 0;
  if (ph.length >= 3 && t >= snap(f, lastVerse(f)) - 1e-6) return 2;
  return 1;
}

const clip = (notes: BandNote[], end: number): BandNote[] =>
  notes
    .filter((n) => n.t < end - 0.01)
    .map((n) => ({ ...n, d: Math.max(0.03, Math.min(n.d, end - n.t)) }))
    .sort((a, b) => a.t - b.t || a.midi - b.midi);

/** Chord tones (root first) as pitches in [lo, hi], ascending. */
function ladder(c: Chord, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) if (c.tones.includes(pc(p))) out.push(p);
  return out;
}

/** Three or four upper notes of a chord in close position near the last ones (common tones kept, the least movement). */
function closeVoicing(c: Chord, lo: number, hi: number, last: number[] | null, size = 3): number[] {
  const upper = c.tones.length > 3 ? c.tones.slice(1) : c.tones;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let bottom = lo; bottom <= hi; bottom++) {
    if (!upper.includes(pc(bottom))) continue;
    const v = [bottom];
    for (let p = bottom + 1; v.length < size && p <= hi + 12; p++) if (upper.includes(pc(p)) && (v.length < upper.length ? !v.some((x) => pc(x) === pc(p)) : true)) v.push(p);
    if (v.length < size || v[v.length - 1] > hi) continue;
    const centre = (lo + hi) / 2;
    const cost = last ? v.reduce((s, x, i) => s + Math.abs(x - (last[i] ?? last[last.length - 1])), 0) : Math.abs(v[Math.min(1, v.length - 1)] - centre);
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  if (best.length) return best;
  // no room for the whole chord: its highest tones that fit, never a note outside it
  const fit = ladder(c, Math.min(lo, hi - 12), hi);
  return fit.length ? fit.slice(-Math.min(size, fit.length)) : [pitchNear(c.root, hi, hi - 11, hi)];
}

/** The highest a held chord may reach over [t, end): a minor third under the lowest note of the tune there. */
function under(f: Frame, t: number, end: number, fallback: number): number {
  let low = Infinity;
  for (const n of f.intro ?? []) if (n.t < end && n.t + n.d > t) low = Math.min(low, n.midi);
  for (const n of f.tune) if (n.t < end && n.t + n.d > t) low = Math.min(low, n.midi);
  return low === Infinity ? fallback : Math.min(fallback, low - 3);
}

/** Times inside [a, b) where a chord starts, with `a` itself first. */
function changes(f: Frame, a: number, b: number): number[] {
  const out = [a];
  for (const c of f.chords) if (c.t > a + 0.05 && c.t < b - 0.05) out.push(c.t);
  return out;
}

/** Where the last chord starts: the last bar's downbeat, or later in that bar. */
const finalAt = (f: Frame, lastBar: number): number => Math.max(lastBar, chordAt(f.chords, f.end - 1e-3).t);

/** The last chord, rolled upward from its root at `lo`, `count` notes `gap` seconds apart, ringing past the voices. */
function finalRoll(f: Frame, at: number, lo: number, hi: number, count: number, gap: number, velocity: number): BandNote[] {
  const c = chordAt(f.chords, f.end - 1e-3);
  const tones = ladder(c, pitchNear(c.root, lo, lo, lo + 11), hi);
  const pick = tones.length <= count ? tones : Array.from({ length: count }, (_, k) => tones[Math.round((k * (tones.length - 1)) / (count - 1))]);
  return pick.map((midi, k) => ({ t: at + k * gap, d: f.end + RING - (at + k * gap), midi, velocity: velocity * (k === 0 ? 1 : 0.85) }));
}

function bassPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const scale = (f.key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE).map((s) => (s + f.key.tonic) % 12);
  const lo = Math.max(PLAYABLE.bass[0], 31);
  let last = 40;
  const rootPitch = (c: Chord): number => (last = pitchNear(c.root, last, lo, 47));
  const all = bars(f);
  // where the bass plays in a bar, in beats: the root on the downbeat, then the fifth
  const hits = f.meter === 2 ? [0, 1] : [0, 2];
  all.forEach((t0, b) => {
    const barEnd = t0 + f.meter * f.beat;
    if (b === all.length - 1) {
      // the last bar: the chords before the last one held, then its root left to ring
      const fin = finalAt(f, t0);
      const at = changes(f, t0, fin);
      if (fin > t0 + 0.05) at.forEach((t, i) => notes.push({ t, d: ((at[i + 1] ?? fin) - t) * 0.94, midi: rootPitch(chordAt(f.chords, t + 1e-4)), velocity: 0.7 }));
      notes.push({ t: fin, d: f.end + RING - fin, midi: rootPitch(chordAt(f.chords, fin + 1e-4)), velocity: 0.8 });
      return;
    }
    if (intensity(f, t0) === 0) {
      // the root alone, where the chord changes
      const at = changes(f, t0, barEnd);
      at.forEach((t, i) => notes.push({ t, d: ((at[i + 1] ?? barEnd) - t) * 0.94, midi: rootPitch(chordAt(f.chords, t + 1e-4)), velocity: 0.7 }));
      return;
    }
    hits.forEach((j, h) => {
      const t = t0 + j * f.beat;
      const c = chordAt(f.chords, t + 1e-4);
      const changed = h > 0 && chordAt(f.chords, t0 + 1e-4) !== c;
      const midi = h === 0 || changed ? rootPitch(c) : last + 7 <= 52 ? last + 7 : last - 5;
      let end = h + 1 < hits.length ? t0 + hits[h + 1] * f.beat : barEnd;
      // a passing note on the bar's last beat, a step from the next bar's new root
      if (h === hits.length - 1 && f.meter >= 3) {
        const next = chordAt(f.chords, barEnd + 1e-4);
        if (next.root !== c.root) {
          const target = pitchNear(next.root, last, lo, 47);
          const steps = midi < target ? [-1, -2] : [1, 2];
          const pass = steps.map((s) => target + s).find((p) => scale.includes(pc(p)));
          if (pass !== undefined && pass >= lo && pass !== midi) {
            end = barEnd - f.beat;
            notes.push({ t: end, d: f.beat * 0.92, midi: pass, velocity: 0.55 });
          }
        }
      }
      // in three the passing note takes the fifth's place
      if (end > t + 0.01) notes.push({ t, d: (end - t) * 0.92, midi, velocity: h === 0 ? 0.8 : 0.65 });
    });
  });
  return clip(notes, f.end + RING);
}

/** Chord spans from where the band begins, cut at the end. */
function spans(f: Frame): { c: Chord; t: number; end: number }[] {
  const out: { c: Chord; t: number; end: number }[] = [];
  for (const c of f.chords) {
    const t = Math.max(c.t, startOf(f));
    const end = Math.min(c.t + c.d, f.end);
    if (end - t > 0.05) out.push({ c, t, end });
  }
  return out;
}

function stringsPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  let upper: number[] | null = null;
  let low = 45;
  const bar = barOf(f);
  const all = spans(f);
  all.forEach((s, i) => {
    const level = intensity(f, s.t);
    const final = i === all.length - 1;
    low = pitchNear(s.c.root, low, 40, 52);
    // two notes at first, three when the band is moving, and always under the tune
    const hi = under(f, s.t, s.end, 76);
    upper = closeVoicing(s.c, Math.min(55, hi - 10), hi, upper, level === 0 ? 2 : 3);
    const velocity = (level === 2 ? 0.62 : level === 1 ? 0.55 : 0.48) + (s.c.cadence ? 0.05 : 0);
    // a chord held long is bowed again every two bars
    for (let t = s.t; t < s.end - 0.05; ) {
      let next = s.end;
      const bars = Math.floor((s.end - t) / bar + 1e-6);
      if (bars > 2) next = f.downbeat + Math.round((t - f.downbeat) / bar + 2) * bar;
      const d = (final && next >= s.end - 1e-6 ? f.end + RING : next) - t;
      if (level > 0) notes.push({ t, d, midi: low, velocity });
      for (const p of upper) notes.push({ t, d, midi: p, velocity });
      t = next;
    }
  });
  return clip(notes, f.end + RING);
}

function harpPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const all = bars(f);
  const barLen = barOf(f);
  // a chord rolled up wherever it changes in [a, b), left to ring
  const rolls = (a: number, b: number) => {
    const at = changes(f, a, b);
    at.forEach((t, i) => {
      const c = chordAt(f.chords, t + 1e-4);
      const ring = (at[i + 1] ?? b) - t;
      const tones = ladder(c, pitchNear(c.root, 45, 40, 51), under(f, t, t + ring, 76)).slice(0, 4);
      tones.forEach((midi, k) => notes.push({ t: t + k * 0.06, d: ring - k * 0.06, midi, velocity: k === 0 ? 0.6 : 0.5 }));
    });
  };
  for (const t0 of all.slice(0, -1)) {
    const level = intensity(f, t0);
    if (level === 0) {
      rolls(t0, t0 + barLen);
      continue;
    }
    // broken chords: a note a beat, then (in the last verse) a note each division of the beat
    const step = level === 1 ? f.beat : f.beat < 0.42 ? f.beat : f.beat / f.division;
    const perBar = Math.round(barLen / step);
    const shape = perBar >= 8 ? [0, 1, 2, 3, 4, 3, 2, 1] : perBar === 6 ? [0, 1, 2, 3, 4, 2] : perBar === 3 ? [0, 1, 2] : [0, 1, 2, 3, 4, 3, 2, 1];
    for (let k = 0; k < perBar; k++) {
      const t = t0 + k * step;
      if (t >= f.end - 0.02) break;
      const c = chordAt(f.chords, t + 1e-4);
      const tones = ladder(c, pitchNear(c.root, 45, 40, 51), 86);
      const midi = tones[shape[k % shape.length] % tones.length];
      // a harp string rings until the chord changes or the bar ends
      const chordEnd = c.t + c.d;
      const d = Math.max(step, Math.min(chordEnd, t0 + barLen) - t);
      notes.push({ t, d, midi, velocity: k === 0 ? 0.65 : 0.5 });
    }
  }
  const last = all[all.length - 1];
  if (last !== undefined) {
    const fin = finalAt(f, last);
    if (fin > last + 0.05) rolls(last, fin);
    notes.push(...finalRoll(f, fin, 36, 84, 6, 0.08, 0.55));
  }
  return clip(notes, f.end + RING);
}

/** A guitar chord: the root low, the rest stacked as an open-position shape would lay them. */
function guitarShape(c: Chord): number[] {
  const bass = pitchNear(c.root, 45, 40, 52);
  const out = [bass];
  for (let p = bass + 1; p <= 71 && out.length < 6; p++) {
    if (!c.tones.includes(pc(p))) continue;
    if (p - out[out.length - 1] < 3) continue; // strings are a third or fourth apart
    out.push(p);
  }
  return out;
}

function guitarPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const strum = f.band.includes("kit") || 60 / f.beat >= 100;
  const eighth = f.beat / f.division;
  const barLen = barOf(f);
  const perBar = Math.round(barLen / eighth);
  const all = bars(f);
  // down (D) or up (U) on each eighth of the bar, "-" none
  const pattern = f.division === 3 ? "D-UD-U".repeat(f.meter) : f.meter === 4 ? "D-DU-UDU" : f.meter === 3 ? "D-DUDU" : "D-DU";
  // one slow strum wherever the chord changes in [a, b), left to ring
  const strums = (a: number, b: number) => {
    const at = changes(f, a, b);
    at.forEach((t, i) => {
      const shape = guitarShape(chordAt(f.chords, t + 1e-4));
      const ring = (at[i + 1] ?? b) - t;
      shape.forEach((midi, k) => notes.push({ t: t + k * 0.025, d: ring - k * 0.025, midi, velocity: 0.5 }));
    });
  };
  for (const t0 of all.slice(0, -1)) {
    if (intensity(f, t0) === 0) {
      strums(t0, t0 + barLen);
      continue;
    }
    for (let k = 0; k < perBar; k++) {
      const t = t0 + k * eighth;
      if (t >= f.end - 0.02) break;
      const c = chordAt(f.chords, t + 1e-4);
      if (strum) {
        const kind = pattern[k % pattern.length];
        if (kind === "-") continue;
        let shape = guitarShape(c);
        if (kind === "U") shape = shape.slice(-4).reverse();
        const spread = kind === "D" ? 0.012 : 0.009;
        let next = k + 1;
        while (next < perBar && pattern[next % pattern.length] === "-") next++;
        const d = (next - k) * eighth;
        shape.forEach((midi, i) => notes.push({ t: t + i * spread, d: d - i * spread, midi, velocity: (kind === "D" ? 0.6 : 0.42) * (k === 0 ? 1.1 : 1) }));
      } else {
        // fingerpicking: the thumb on the bass (root, then fifth), the fingers on the upper strings
        const shape = guitarShape(c);
        const half = barLen / (f.meter === 4 ? 2 : 1);
        const ring = Math.max(eighth, half - ((t - t0) % half));
        const midi = k % 4 === 0 ? (k === 0 ? shape[0] : shape[Math.min(1, shape.length - 1)]) : shape[Math.max(1, shape.length - [3, 2, 1, 2][k % 4])];
        notes.push({ t, d: ring, midi, velocity: k % 4 === 0 ? 0.6 : 0.45 });
      }
    }
  }
  const last = all[all.length - 1];
  if (last !== undefined) {
    const fin = finalAt(f, last);
    if (fin > last + 0.05) strums(last, fin);
    notes.push(...finalRoll(f, fin, 40, 71, 6, 0.04, 0.6));
  }
  return clip(notes, f.end + RING);
}

function pianoPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  let right: number[] | null = null;
  let low = 43;
  const all = bars(f);
  const barLen = barOf(f);
  all.forEach((t0, b) => {
    const at = (beat: number) => t0 + beat * f.beat;
    const chord = (t: number) => chordAt(f.chords, t + 1e-4);
    const lh = (t: number, d: number, octave: boolean, fifth: boolean) => {
      const c = chord(t);
      if (fifth) {
        notes.push({ t, d, midi: low + 7 <= 55 ? low + 7 : low - 5, velocity: 0.5 });
        return;
      }
      low = pitchNear(c.root, low, 33, 47);
      notes.push({ t, d, midi: low, velocity: 0.6 });
      if (octave) notes.push({ t, d, midi: low + 12, velocity: 0.5 });
    };
    const rh = (t: number, d: number, velocity: number) => {
      const top = under(f, t, t + d, 77);
      right = closeVoicing(chord(t), Math.min(55, top - 10), top, right, 3);
      for (const p of right) notes.push({ t, d, midi: p, velocity });
    };
    // a chord held wherever the harmony changes in [a, b)
    const held = (a: number, b: number) => {
      const when = changes(f, a, b);
      when.forEach((t, i) => {
        const d = (when[i + 1] ?? b) - t;
        lh(t, d, false, false);
        rh(t + 0.02, d - 0.02, 0.42);
      });
    };
    if (b === all.length - 1) {
      // the chords before the last held, then the last spread a little from the bottom, left to ring
      const fin = finalAt(f, t0);
      if (fin > t0 + 0.05) held(t0, fin);
      lh(fin, f.end + RING - fin, true, false);
      right = closeVoicing(chord(fin), 60, 79, right, 3);
      right.forEach((p, k) => notes.push({ t: fin + 0.03 * (k + 2), d: f.end + RING - fin, midi: p, velocity: 0.55 }));
      return;
    }
    if (intensity(f, t0) === 0) {
      held(t0, t0 + barLen);
      return;
    }
    if (f.meter === 3) {
      lh(at(0), f.beat, true, false);
      rh(at(1), f.beat * 0.9, 0.42);
      rh(at(2), f.beat * 0.9, 0.42);
    } else if (f.meter === 4) {
      const changed = chord(at(2)) !== chord(at(0));
      lh(at(0), 2 * f.beat, true, false);
      lh(at(2), 2 * f.beat, false, !changed);
      if (60 / f.beat >= 100) {
        // a chord on every beat, but not under a passing note of the tune: that beat is the tune's
        for (let j = 0; j < 4; j++) {
          const sung = f.tune.find((n) => n.t <= at(j) + 1e-3 && at(j) < n.t + n.d - 1e-3);
          if (j > 0 && sung && !chord(at(j)).tones.includes(pc(sung.midi))) continue;
          rh(at(j), f.beat * 0.85, j % 2 ? 0.42 : 0.5);
        }
      } else {
        rh(at(0), 2 * f.beat, 0.5);
        rh(at(2), 2 * f.beat, 0.46);
      }
    } else {
      lh(at(0), f.beat, true, false);
      rh(at(1), f.beat * 0.9, 0.46);
    }
  });
  return clip(notes, f.end + RING);
}

function flutePart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const [lo, hi] = PLAYABLE.flute;
  const from = lastVerse(f);
  const verse = f.tune.filter((n) => n.t >= from - 1e-6);
  if (verse.length && intensity(f, snap(f, from) + 1e-3) === 2) {
    // the last verse an octave over the tune, when the band is at its fullest
    const top = Math.max(...verse.map((n) => n.midi));
    const bottom = Math.min(...verse.map((n) => n.midi));
    let shift = 12;
    while (top + shift > hi - 3 && shift > -12) shift -= 12;
    while (bottom + shift < lo) shift += 12;
    for (const n of verse) notes.push({ t: n.t, d: n.d, midi: n.midi + shift, velocity: 0.5 });
  }
  // before it, answer the tune where it rests or holds a long note (not in the first phrase)
  notes.push(...answers(f, [72, 88]));
  return clip(notes, f.end);
}

/** Who answers the tune when there is no flute: the first of these in the band. */
function answerer(ids: readonly InstrumentId[]): InstrumentId | undefined {
  if (ids.includes("flute")) return undefined;
  // (not the strings: they hold the chords under the tune, and an answer goes over it)
  return (["sarod", "harp", "piano", "guitar"] as InstrumentId[]).find((id) => ids.includes(id));
}

/**
 * Answers to the tune, where it rests or holds a long note (not in the first phrase, nor the last
 * verse, when everyone sings it): a falling run of the chord's notes in [lo, hi), from high to
 * just above where the tune is, as an accompanist fills a held note.
 */
function answers(f: Frame, [lo, hi]: readonly [number, number]): BandNote[] {
  const notes: BandNote[] = [];
  const from = lastVerse(f);
  const top = Math.min(hi, 88);
  const bottom = Math.max(lo, top - 16);
  f.tune.forEach((n, i) => {
    if (n.t >= from - 1e-6 || intensity(f, n.t + f.beat) === 0) return;
    const next = f.tune[i + 1];
    const until = next ? next.t : f.end;
    const room = until - (n.t + f.beat);
    if (n.d < 2 * f.beat - 1e-6 && until - (n.t + n.d) < 1.5 * f.beat) return;
    if (room < 1.5 * f.beat) return;
    const c = chordAt(f.chords, n.t + f.beat + 1e-4);
    const tones = ladder(c, bottom, top);
    if (!tones.length) return;
    const step = f.beat / 2;
    const count = Math.min(4, Math.floor(room / step) - 1);
    for (let k = 0; k < count; k++) {
      const midi = tones[Math.max(0, tones.length - 1 - k - (tones.length > 4 ? 1 : 0))];
      notes.push({ t: n.t + f.beat + k * step, d: k === count - 1 ? step * 1.8 : step * 0.95, midi, velocity: 0.45 });
    }
  });
  return notes;
}

function timpaniPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const [lo, hi] = PLAYABLE.timpani;
  const tonic = pitchNear(f.key.tonic, 45, lo, hi);
  const dominant = pitchNear(f.key.tonic + 7, tonic - 5, lo, hi);
  const pitchOf = (c: Chord) => (c.root === f.key.tonic ? tonic : c.root === (f.key.tonic + 7) % 12 ? dominant : -1);
  const barLen = barOf(f);
  const downbeatOf = (t: number) => f.downbeat + Math.max(0, Math.round((t - f.downbeat) / barLen - 0.25)) * barLen;
  notes.push({ t: f.downbeat, d: f.beat, midi: tonic, velocity: 0.6 });
  const finalChord = f.chords[f.chords.length - 1];
  // a stroke at the cadences, once the band is moving
  for (const c of f.chords) {
    if (!c.cadence || c === finalChord) continue;
    const p = pitchOf(c);
    const t = Math.max(f.downbeat, downbeatOf(c.t));
    if (p < 0 || intensity(f, t) === 0) continue;
    if (t < f.end - f.beat) notes.push({ t, d: f.beat, midi: p, velocity: 0.7 });
  }
  // a roll on the last chord, growing, then one stroke to close it
  const rollFrom = Math.max(f.downbeat, finalChord.t, f.end - f.meter * f.beat);
  const rollEnd = f.end;
  const stroke = 1 / 14;
  const strokes = Math.floor((rollEnd - rollFrom) / stroke);
  for (let k = 0; k < strokes; k++) notes.push({ t: rollFrom + k * stroke, d: stroke, midi: tonic, velocity: 0.25 + (0.4 * k) / Math.max(1, strokes) });
  notes.push({ t: rollEnd, d: f.beat, midi: tonic, velocity: 0.8 });
  // no two strokes at once
  const sorted = notes.sort((a, b) => a.t - b.t);
  return clip(sorted.filter((n, i) => i === 0 || n.t - sorted[i - 1].t > 0.03), f.end + f.beat + 0.01);
}

/** General MIDI percussion numbers. */
const KICK = 36;
const SNARE = 38;
const HAT = 42;
const CRASH = 49;
const TOMS = [50, 47, 45, 43];

function kitPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const hit = (t: number, midi: number, velocity: number) => notes.push({ t, d: 0.1, midi, velocity });
  const all = bars(f);
  const barLen = barOf(f);
  const barIndex = (t: number) => Math.round((t - all[0]) / barLen);
  // a crash where the band grows, and where every other phrase of the last verse starts, with a fill into it
  const crashes = new Set<number>();
  all.forEach((t0, b) => {
    if (b > 0 && intensity(f, t0) > intensity(f, all[b - 1])) crashes.add(b);
  });
  f.phrases.forEach((p, i) => {
    const b = barIndex(snap(f, p.t));
    if (i % 2 === 0 && b > 0 && b < all.length - 1 && intensity(f, all[b]) === 2) crashes.add(b);
  });
  all.forEach((t0, b) => {
    if (b === all.length - 1) {
      hit(t0, KICK, 0.85);
      hit(t0, CRASH, 0.7);
      return;
    }
    const fill = crashes.has(b + 1);
    // the drums wait for the second phrase, except for the fill that brings them in
    if (intensity(f, t0) === 0 && !fill) return;
    if (crashes.has(b)) hit(t0, CRASH, 0.6);
    const sub = f.beat / f.division;
    const per = Math.round(barLen / sub);
    for (let k = 0; k < per; k++) {
      const t = t0 + k * sub;
      const beat = k / f.division;
      const onBeat = k % f.division === 0;
      const late = beat >= f.meter - 2 + (f.meter === 3 ? 1 : 0);
      if (fill && late) {
        if (onBeat || f.division === 2) hit(t, TOMS[Math.min(TOMS.length - 1, Math.floor((beat - (f.meter - 2)) * 2))], 0.65);
        continue;
      }
      if (intensity(f, t0) === 0) continue;
      if (!crashes.has(b) || k > 0) hit(t, HAT, onBeat ? 0.5 : 0.35);
      if (!onBeat) continue;
      if (f.meter === 4) {
        if (beat === 0 || beat === 2) hit(t, KICK, 0.8);
        if (beat === 1 || beat === 3) hit(t, SNARE, 0.62);
        if (beat === 2 && b % 2 === 1) hit(t + sub, KICK, 0.55);
      } else if (f.meter === 3) {
        if (beat === 0) hit(t, KICK, 0.8);
        else hit(t, SNARE, 0.38);
      } else {
        if (beat === 0) hit(t, KICK, 0.8);
        else hit(t, SNARE, 0.62);
      }
    }
  });
  return clip(notes, f.end + 0.2);
}

function tanpuraPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const sa = pitchNear(f.key.tonic, 50, 46, 57);
  const pa = pitchNear(f.key.tonic + 7, sa - 5, 41, sa - 1);
  const low = sa - 12;
  const barLen = barOf(f);
  // one round of the four strings takes two to five seconds, whatever the tempo
  let cycle = barLen;
  while (cycle < 2.2) cycle += barLen;
  while (cycle > 5.5 && cycle / 2 >= 2) cycle /= 2;
  // from the band's first bar (on a downbeat at or before the first note), to the end
  let t = startOf(f);
  const first = Math.min(f.tune[0]?.t ?? t, f.intro?.[0]?.t ?? Infinity);
  while (t > first + 1e-6) t -= barLen;
  for (; t < f.end - 0.3; t += cycle) {
    [pa, sa, sa, low].forEach((midi, k) => {
      const at = t + (k * cycle) / 4;
      if (at < f.end - 0.2) notes.push({ t: at, d: cycle, midi, velocity: k === 0 ? 0.65 : 0.6 });
    });
  }
  return clip(notes.filter((n) => n.t >= 0), f.end + RING);
}

/** Tabla strokes, as BandNote midi values (see src/band/index.ts): bayan, dayan, and both. */
const STROKES: Record<string, number[]> = {
  dha: [0, 1],
  dhin: [0, 2],
  dhi: [0, 2],
  ge: [0],
  na: [1],
  ta: [1],
  tin: [2],
  ti: [4],
  ka: [3],
};
const THEKA: Record<number, string[]> = {
  // keherwa, eight beats
  4: ["dha", "ge", "na", "ti", "na", "ka", "dhi", "na"],
  // dadra, six beats
  3: ["dha", "dhin", "na", "dha", "tin", "na"],
  2: ["dha", "dhin", "na", "dha", "tin", "na"],
};

function tablaPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const cycle = THEKA[f.meter] ?? THEKA[4];
  // a theka beat is a beat of the song, or an eighth in a slow one (or a 6/8)
  const step = f.division === 3 ? f.beat / 3 : f.beat >= 0.62 ? f.beat / 2 : f.beat;
  const all = bars(f);
  const last = all[all.length - 1];
  // the cycle counted from the voices' first downbeat; the drums come in with the second phrase
  for (let t = startOf(f); t < last - 1e-6; t += step) {
    if (intensity(f, t) === 0) continue;
    const k = Math.round((t - f.downbeat) / step);
    const at = ((k % cycle.length) + cycle.length) % cycle.length;
    const bol = cycle[at];
    const velocity = at === 0 ? 0.8 : bol === "ka" || bol === "ti" ? 0.45 : 0.6;
    for (const midi of STROKES[bol]) notes.push({ t, d: step, midi, velocity });
  }
  for (const midi of STROKES.dha) notes.push({ t: last, d: f.beat, midi, velocity: 0.85 });
  return clip(notes, f.end + 0.2);
}

/** A sarod: a low note on each bar's first beat, the chord broken over it on the other beats. */
function sarodPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const all = bars(f);
  all.slice(0, -1).forEach((t0) => {
    const level = intensity(f, t0);
    const low = pitchNear(chordAt(f.chords, t0 + 1e-4).root, 47, 41, 53);
    notes.push({ t: t0, d: 2 * f.beat, midi: low, velocity: 0.85 });
    if (level === 0) return;
    for (let k = 1; k < f.meter; k++) {
      const t = t0 + k * f.beat;
      const tones = ladder(chordAt(f.chords, t + 1e-4), 53, under(f, t, t + 1.5 * f.beat, 72));
      if (!tones.length) continue;
      notes.push({ t, d: 1.5 * f.beat, midi: tones[k % 2 === 1 ? 0 : tones.length - 1], velocity: 0.6 });
      if (level === 2 && tones.length > 1) notes.push({ t: t + f.beat / 2, d: f.beat, midi: tones[1], velocity: 0.5 });
    }
  });
  const last = all[all.length - 1];
  if (last !== undefined) notes.push(...finalRoll(f, finalAt(f, last), 36, 72, 6, 0.05, 0.7));
  return clip(notes, f.end + RING);
}

/** An esraj: two notes of each chord held, each moving to the nearest note of the next chord. */
function esrajPart(f: Frame): BandNote[] {
  const notes: BandNote[] = [];
  const ranges = [[53, 63], [60, 72]];
  const at = [57, 65];
  const open: (BandNote | null)[] = [null, null];
  const bar = barOf(f);
  const all = spans(f);
  all.forEach((s, i) => {
    const end = i === all.length - 1 ? f.end + RING : s.end;
    // the upper note first; the lower takes another note of the chord
    for (const v of [1, 0]) {
      const top = Math.min(ranges[v][1], under(f, s.t, s.end, ranges[v][1]));
      let options = ladder(s.c, Math.min(ranges[v][0], top - 7), top).filter((m) => v === 1 || pc(m) !== pc(at[1]));
      if (!options.length) options = ladder(s.c, top - 11, top);
      if (!options.length) continue;
      const midi = options.reduce((best, m) => (Math.abs(m - at[v]) < Math.abs(best - at[v]) ? m : best), options[0]);
      at[v] = midi;
      // a note held long is bowed again every two bars
      for (let t = s.t; t < end - 0.05; ) {
        let next = end;
        if (Math.floor((end - t) / bar + 1e-6) > 2) next = f.downbeat + Math.round((t - f.downbeat) / bar + 2) * bar;
        const o = open[v];
        if (o && o.midi === midi && next - o.t <= 2 * bar + 0.05) o.d = next - o.t;
        else {
          open[v] = { t, d: next - t, midi, velocity: 0.55 };
          notes.push(open[v]!);
        }
        t = next;
      }
    }
  });
  return clip(notes, f.end + RING);
}

const WRITERS: Record<InstrumentId, (f: Frame) => BandNote[]> = {
  bass: bassPart,
  strings: stringsPart,
  harp: harpPart,
  guitar: guitarPart,
  piano: pianoPart,
  flute: flutePart,
  timpani: timpaniPart,
  kit: kitPart,
  tanpura: tanpuraPart,
  tabla: tablaPart,
  sarod: sarodPart,
  esraj: esrajPart,
};

/** The intro's tune moved by octaves to where the lead plays it. */
function introFor(lead: InstrumentId, intro: readonly NoteIn[]): BandNote[] {
  const [lo, hi] = PLAYABLE[lead];
  const pitches = intro.map((n) => n.midi);
  const mid = (Math.min(...pitches) + Math.max(...pitches)) / 2;
  let shift = 12 * Math.round(((LEAD_CENTRE[lead] ?? 72) - mid) / 12);
  while (Math.max(...pitches) + shift > hi) shift -= 12;
  while (Math.min(...pitches) + shift < lo) shift += 12;
  // played out, as a soloist: the voices are not there yet
  return intro.map((n) => ({ t: n.t, d: n.d, midi: n.midi + shift, velocity: 0.85 }));
}

/** The parts for these instruments. */
export function writeBand(f: Frame, instruments: readonly InstrumentId[]): BandPart[] {
  if (!f.tune.length || !f.chords.length) return [];
  const ids = [...new Set(instruments)].filter((id) => WRITERS[id]);
  const lead = f.intro?.length ? LEADS.find((id) => ids.includes(id)) : undefined;
  const out: BandPart[] = [];
  for (const id of ids) {
    let notes = WRITERS[id](f);
    if (FILLING.has(id)) notes = clear(notes, f.sung?.length ? f.sung : [f.tune], f.beat);
    // without a flute, the first melodic instrument of the band answers the tune where it holds
    if (id === answerer(ids)) notes = [...notes, ...clear(answers(f, PLAYABLE[id]), f.sung?.length ? f.sung : [f.tune], f.beat)].sort((a, b) => a.t - b.t || a.midi - b.midi);
    notes = follow(notes, id, f.beat, f.energy, f.texture);
    if (id === lead) {
      // the lead plays the tune in the introduction, and its own part once the voices come in
      notes = [...introFor(id, f.intro!), ...notes.filter((n) => n.t >= f.downbeat - 1e-6)].sort((a, b) => a.t - b.t || a.midi - b.midi);
    }
    if (!notes.length) continue;
    const name = INSTRUMENTS.find((x) => x.id === id)?.name ?? id;
    out.push({ instrument: id, name, notes, level: MIX[id].level, place: MIX[id].place });
  }
  return out;
}

export { MIX as BAND_MIX };
