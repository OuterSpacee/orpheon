// Touch: play the body live. A vowel pad, the computer keyboard as a piano, a MIDI keyboard if
// there is one, a row of consonants, and a direct control for each thing the body does.
import { TELEMETRY } from "../../contract.ts";
import type { PoseKey } from "../../contract.ts";
import type { App, ModeParts } from "../app.ts";
import { BODY_MAX, bodyName, keyboardBase } from "../bodies.ts";
import { el, typing } from "../dom.ts";
import { clamp, hzToMidi, midiToHz, noteName } from "../notes.ts";
import { CONSONANTS, CONSONANT_NAMES } from "../scores.ts";
import { OCTAVE_KEYS, OCTAVE_RANGE, keyNote } from "../touch/keys.ts";
import type { Player } from "../touch/player.ts";
import { slider, toggle } from "../ui/controls.ts";
import { mountMidi } from "../ui/midi.ts";
import { mountPad } from "../ui/pad.ts";

export function mountTouch(app: App, player: Player): ModeParts {
  const { store, sound } = app;
  const s0 = store.get();
  const here = () => store.get().mode === "touch";

  // ── the controls ──
  const body = slider({
    label: "Body", min: 0, max: BODY_MAX, step: 0.05, value: s0.body, numeric: false,
    show: bodyName, input: (v) => store.set({ body: v }),
  });
  const voices = slider({
    label: "Voices", min: 1, max: 6, step: 1, value: s0.voices,
    show: (v) => String(v), input: (v) => store.set({ voices: v }),
  });
  const pitch = slider({
    label: "Pitch", min: 33, max: 84, step: 1, value: s0.note,
    show: (v) => `${noteName(v)} ${Math.round(midiToHz(v))} Hz`, input: (v) => store.set({ note: v }),
  });
  const breath = slider({ label: "Breath", min: 0.1, max: 1, step: 0.01, value: s0.breath, ends: ["soft", "strong"], input: (v) => store.set({ breath: v }) });
  const quality = slider({
    label: "Voice quality", min: 0, max: 1, step: 0.01, value: s0.quality, ends: ["pressed", "breathy"],
    input: (v) => store.set({ quality: v }),
  });

  /** A slider bound to one value of the pose. */
  const posed = (key: PoseKey, label: string, max = 1, ends?: [string, string], show?: (v: number) => string) => {
    const dial = slider({
      label, min: 0, max, step: max > 1 ? 1 : 0.01, value: s0.pose[key], ends, show,
      input: (v) => store.set({ pose: { ...store.get().pose, [key]: v } }),
    });
    store.on(["pose"], (s) => dial.set(s.pose[key]));
    return dial.root;
  };
  const follow = toggle("Mouth follows the tongue", s0.follow, (on) => store.set({ follow: on }));
  const latch = toggle("Keep voicing", s0.latch, async (on) => {
    if (on) await sound.wake();
    store.set({ latch: on });
  });

  const midi = mountMidi(app, "touch", {
    noteOn: (note, velocity) => player.noteOn(note, velocity),
    noteOff: (note) => player.noteOff(note),
    wheel: (amount) => store.set({ pose: { ...store.get().pose, vibrato: Math.round(amount * 80) } }),
  });

  store.on(["body"], (s) => body.set(s.body));
  store.on(["voices"], (s) => voices.set(s.voices));
  store.on(["note"], (s) => pitch.set(clamp(s.note, 33, 84)));
  store.on(["breath"], (s) => breath.set(s.breath));
  store.on(["quality"], (s) => quality.set(s.quality));
  store.on(["follow"], (s) => follow.set(s.follow));
  store.on(["latch"], (s) => latch.set(s.latch));

  const controls = el(
    "div.mode-controls",
    {},
    el("div.group", {}, el("h2.group-title", {}, "Voice"), body.root, voices.root),
    el(
      "div.group",
      {},
      el("h2.group-title", {}, "Sound"),
      pitch.root,
      breath.root,
      quality.root,
      posed("register", "Register", 1, ["chest", "falsetto"]),
      posed("vibrato", "Vibrato", 80, ["steady", "wavering"], (v) => `${Math.round(v)} cents`),
    ),
    el(
      "div.group",
      {},
      el("h2.group-title", {}, "Mouth"),
      posed("jaw", "Jaw", 1, ["closed", "wide open"]),
      posed("lips", "Lips", 1, ["sealed", "open"]),
      posed("round", "Lip rounding", 1, ["spread, as in ee", "round, as in oo"]),
      posed("velum", "Soft palate", 1, ["through the mouth", "through the nose"]),
    ),
    el("div.group.wide", {}, el("h2.group-title", {}, "Playing"), follow.root, latch.root, midi),
  );

  // ── the surface: the pad, and a row of consonants ──
  const pad = mountPad(app, player);
  const consonants = el("div.consonants", { role: "group", "aria-label": "Consonants. Each says itself before the vowel the mouth is shaped for." });
  for (const ph of CONSONANTS) {
    consonants.append(
      el("button.consonant", {
        type: "button",
        "aria-label": CONSONANT_NAMES[ph] ?? ph,
        onclick: async () => {
          if (await sound.wake()) player.consonant(ph);
        },
      }, ph),
    );
  }
  const surface = el("div.touch-surface", {}, pad, consonants);

  // ── the computer keyboard ──
  const down = new Map<string, number>();
  window.addEventListener("keydown", (event) => {
    if (!here() || typing() || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "Space" && !(document.activeElement instanceof HTMLButtonElement)) {
      event.preventDefault();
      void sound.wake().then((ok) => ok && down.has("Space") && player.hold("space", true));
      down.set("Space", 0);
      return;
    }
    const octave = OCTAVE_KEYS[event.code];
    if (octave) return store.set({ octave: clamp(store.get().octave + octave, -OCTAVE_RANGE, OCTAVE_RANGE) });
    const note = keyNote(event.code, keyboardBase(store.get().body), store.get().octave);
    if (note === null) return;
    event.preventDefault();
    down.set(event.code, note);
    void sound.wake().then((ok) => ok && down.get(event.code) === note && player.noteOn(note));
  });
  window.addEventListener("keyup", (event) => {
    const note = down.get(event.code);
    if (note === undefined) return;
    down.delete(event.code);
    if (event.code === "Space") player.hold("space", false);
    else player.noteOff(note);
  });
  // Keys held when the window loses the keyboard never send their key-up.
  window.addEventListener("blur", () => {
    down.forEach((note, code) => (code === "Space" ? player.hold("space", false) : player.noteOff(note)));
    down.clear();
  });
  store.on(["octave"], (s, before) => {
    if (s.octave === before.octave) return;
    const low = keyboardBase(s.body) + 12 * s.octave;
    app.remark(`The keys A to ; now play ${noteName(low)} to ${noteName(low + 16)}.`);
  });

  return {
    controls,
    surface,
    frame() {
      pad.classList.toggle("voiced", player.voicing);
    },
    readout() {
      // The pitch really sounding, from the voice itself.
      const f0 = sound.telemetry(app.shown())[TELEMETRY.f0];
      return f0 > 20 ? `${noteName(hzToMidi(f0))}  ${Math.round(f0)} Hz` : "";
    },
  };
}
