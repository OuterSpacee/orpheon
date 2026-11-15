// The Instrument mode's player: six voices seated as one instrument, each aimed at the pose its
// note and the tone ask for. The swell in and the dying away are shaped here, a step every
// animation frame; the body's own inertia smooths the steps.
import type { Pose } from "../../contract.ts";
import type { App } from "../app.ts";
import { bodyAt, sizedBody } from "../bodies.ts";
import { midiToHz } from "../notes.ts";
import { SOLO } from "../save.ts";
import { mouthFor } from "../scores.ts";
import type { VowelSpot } from "../scores.ts";
import { detuneOf, glottisFor, presetById } from "./presets.ts";
import type { Preset, Tone } from "./presets.ts";
import { assign, unisonOf } from "./voicing.ts";

const SEATS = 6;

/** The pose for one voice of the instrument: its note (in cents off it), how far into its swell, at time `t` (for a sweep). */
export function poseOf(tone: Tone, preset: Preset, vowels: readonly VowelSpot[], note: number, cents: number, swell: number, velocity: number, t: number): Partial<Pose> {
  const pose: Partial<Pose> = {
    tongueX: tone.x,
    tongueY: tone.y,
    ...mouthFor(tone.x, tone.y, vowels),
    tip: 0,
    tipX: 0.5,
    velum: 0,
    lateral: 0,
    larynx: 0,
    register: 0,
    ...preset.pose,
    glottis: glottisFor(tone.noise),
    vibrato: tone.vibrato,
    pitch: midiToHz(note) * 2 ** (cents / 1200),
    // A breathy voice spends more breath; a singer leans on it as the folds part.
    lungs: (0.55 + 0.25 * tone.noise) * (0.5 + 0.5 * velocity) * swell,
  };
  const sweep = preset.sweep;
  if (sweep) pose[sweep.key] = sweep.low + (sweep.high - sweep.low) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / sweep.seconds));
  return pose;
}

export interface Instrumentalist {
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  /** Let go of everything. */
  quiet(): void;
  /** One step of the swells, every animation frame. */
  frame(): void;
  /** The notes held, oldest first. */
  readonly held: readonly number[];
  /** The seat that took the newest note. */
  readonly lead: number;
  /** How far each seat is into its swell, 0 silent to 1 full. */
  readonly swells: readonly number[];
}

export function createInstrumentalist(app: App): Instrumentalist {
  const { store, sound } = app;
  const held: number[] = [];
  const velocities = new Map<number, number>();
  let notes: (number | null)[] = new Array(SEATS).fill(null);
  /** The note each seat sang last, so it dies away on its own pitch. */
  const last: number[] = new Array(SEATS).fill(57);
  const swells: number[] = new Array(SEATS).fill(0);
  const quietSent: boolean[] = new Array(SEATS).fill(true);
  let lead = 0;
  let seated = false;
  let before = performance.now();
  const began = performance.now();
  const here = () => store.get().mode === "instrument";

  /** Seat all six voices with this body, as one instrument; give the seats back when leaving. */
  function seat(): void {
    const s = store.get();
    if (here()) {
      const body = sizedBody(s.body, s.tone.size);
      for (let k = 0; k < SEATS; k++) {
        if (!sound.has(k)) sound.add(k, body, 0, 0);
        else sound.setBody(k, body);
      }
      seated = true;
      mix();
      return;
    }
    if (!seated) return;
    seated = false;
    quiet();
    // Touch keeps the voices it plays with; every other mode starts from the first alone.
    const keep = s.mode === "touch" ? Math.max(1, Math.min(SEATS, Math.round(s.voices))) : 1;
    for (let k = keep; k < SEATS; k++) sound.remove(k);
    for (let k = 0; k < keep; k++) sound.setBody(k, bodyAt(s.body));
    if (keep === 1) sound.mix(0, SOLO.level, SOLO.place);
  }

  /** Levels and places: voices on one note spread across the stereo field by their unison place; voices together are each a little quieter. */
  function mix(): void {
    const s = store.get();
    const sounding = Math.max(1, notes.filter((n) => n !== null).length);
    for (let k = 0; k < SEATS; k++) {
      const { index, count } = unisonOf(notes, k);
      const place = count > 1 ? s.tone.spread * (2 * (index / (count - 1)) - 1) : s.tone.spread * 0.5 * ((2 * k) / (SEATS - 1) - 1);
      sound.mix(k, 0.8 / sounding ** 0.45, place);
    }
  }

  function reassign(): void {
    const next = assign(notes, held, store.get().tone.unison);
    next.forEach((note, k) => {
      if (note !== null) last[k] = note;
    });
    const changed = next.some((n, k) => n !== notes[k]);
    notes = next;
    if (changed) mix();
  }

  function quiet(): void {
    held.length = 0;
    notes = new Array(SEATS).fill(null);
    for (let k = 0; k < SEATS; k++) {
      swells[k] = 0;
      quietSent[k] = true;
      if (sound.has(k)) sound.aim(k, { lungs: 0 });
    }
  }

  store.on(["mode", "audio", "playing"], seat);
  store.on(["body"], () => here() && seat());
  store.on(["tone"], (s, was) => {
    if (!here()) return;
    if (s.tone.size !== was.tone.size) seat();
    if (s.tone.unison !== was.tone.unison) reassign();
    if (s.tone.spread !== was.tone.spread) mix();
  });

  return {
    noteOn(note, velocity = 0.85) {
      if (!here()) return;
      const at = held.indexOf(note);
      if (at >= 0) held.splice(at, 1);
      held.push(note);
      velocities.set(note, velocity);
      reassign();
      const seatOf = notes.indexOf(note);
      if (seatOf >= 0) lead = seatOf;
    },
    noteOff(note) {
      const at = held.indexOf(note);
      if (at < 0) return;
      held.splice(at, 1);
      reassign();
    },
    quiet,
    frame() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - before) / 1000);
      before = now;
      if (!here()) return;
      const s = store.get();
      const preset = presetById(s.preset);
      const t = (now - began) / 1000;
      for (let k = 0; k < SEATS; k++) {
        const on = notes[k] !== null;
        const swell = on ? Math.min(1, swells[k] + dt / Math.max(0.01, s.tone.attack)) : Math.max(0, swells[k] - dt / Math.max(0.02, s.tone.release));
        swells[k] = swell;
        if (swell === 0) {
          if (!quietSent[k]) sound.aim(k, { lungs: 0 });
          quietSent[k] = true;
          continue;
        }
        quietSent[k] = false;
        const { index, count } = unisonOf(notes, k);
        const note = notes[k] ?? last[k];
        sound.aim(k, poseOf(s.tone, preset, s.vowels, note, detuneOf(index, count, s.tone.detune), swell, velocities.get(note) ?? 0.85, t));
      }
    },
    get held() {
      return held;
    },
    get lead() {
      return lead;
    },
    get swells() {
      return swells;
    },
  };
}
