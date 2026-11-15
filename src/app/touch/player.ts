// Playing the body live: turns what is held (the pad, a key, a MIDI note, the body itself) and
// where the controls stand into the pose each voice is aimed at.
import type { PhoneSymbol, Pose } from "../../contract.ts";
import type { App } from "../app.ts";
import { bodyAt } from "../bodies.ts";
import { clamp, midiToHz } from "../notes.ts";
import { consonantVowel, nearestVowel } from "../scores.ts";
import { Allotment, seating } from "./allot.ts";

export interface Player {
  /** Something began or stopped holding the voice open: "pad", "space", "body". */
  hold(what: string, on: boolean): void;
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  /** Say one consonant in front of the vowel the mouth is shaped for. */
  consonant(ph: PhoneSymbol): void;
  /** Let go of everything. */
  quiet(): void;
  /** Is anything holding the voice open? */
  readonly voicing: boolean;
  /** The seat that took the newest note. */
  readonly lead: number;
}

export function createPlayer(app: App): Player {
  const { store, sound } = app;
  const holds = new Set<string>();
  let allot = new Allotment(1);
  let seated = 1;
  let lead = 0;
  let velocity = 1;

  const voicing = () => holds.size > 0 || allot.any || store.get().latch;

  function aim(): void {
    const s = store.get();
    if (s.mode !== "touch") return;
    const on = voicing();
    for (let seat = 0; seat < seated; seat++) {
      const note = allot.notes[seat];
      // With keys down, only the voices that have a note sing; otherwise the first voice alone.
      const sings = allot.any ? note !== null : on && seat === 0;
      const pose: Partial<Pose> = {
        ...s.pose,
        pitch: midiToHz(note ?? s.note),
        lungs: sings ? s.breath * (0.5 + 0.5 * velocity) : 0,
        // Pressed (0.28) through ordinary voice (0.5) to breathy (0.78): see Pose.glottis.
        glottis: 0.28 + 0.5 * s.quality,
      };
      sound.aim(seat, pose);
    }
  }

  /** Seat as many voices as the mode wants, spread from left to right. */
  function seat(): void {
    const s = store.get();
    const want = s.mode === "touch" ? clamp(Math.round(s.voices), 1, 6) : 1;
    for (let i = 1; i < Math.max(want, seated); i++) {
      if (i >= want) sound.remove(i);
      else if (i >= seated) sound.add(i, bodyAt(s.body), 0, 0);
    }
    for (let i = 0; i < want; i++) {
      const { level, place } = seating(i, want);
      sound.mix(i, level, place);
    }
    if (want !== seated) {
      allot = new Allotment(want);
      lead = 0;
    }
    seated = want;
    aim();
  }

  store.on(["voices", "mode", "audio"], seat);
  store.on(["pose", "note", "breath", "quality", "latch"], aim);
  store.on(["mode"], (s) => {
    if (s.mode !== "touch") quiet();
  });

  function quiet(): void {
    holds.clear();
    allot.clear();
    if (store.get().latch) store.set({ latch: false });
    for (let seat = 0; seat < seated; seat++) sound.aim(seat, { lungs: 0 });
  }

  return {
    hold(what, on) {
      if (on === holds.has(what)) return;
      if (on) holds.add(what);
      else holds.delete(what);
      aim();
    },
    noteOn(note, v = 1) {
      velocity = v;
      lead = allot.press(note);
      // The pitch control follows the keys, so the pad carries on at the last note played.
      if (store.get().note !== note) store.set({ note });
      else aim();
    },
    noteOff(note) {
      if (allot.release(note) >= 0) aim();
    },
    consonant(ph) {
      const s = store.get();
      const vowel = nearestVowel(s.pose.tongueX, s.pose.tongueY, s.vowels);
      sound.perform(lead, consonantVowel(ph, vowel, midiToHz(allot.notes[lead] ?? s.note)));
    },
    quiet,
    get voicing() {
      return voicing();
    },
    get lead() {
      return lead;
    },
  };
}
