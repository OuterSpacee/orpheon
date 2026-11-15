// Instrument: the voice as something to play for its sound. A preset is a way of holding the
// body (a choir pad, a whisper, a hum, a giant); the controls bend it; the keys, the computer
// keyboard and a MIDI keyboard play it, several notes at once across the six voices.
import type { App, ModeParts } from "../app.ts";
import { BODY_MAX, bodyName, keyboardBase } from "../bodies.ts";
import { el, typing } from "../dom.ts";
import { createInstrumentalist } from "../instrument/player.ts";
import { PRESETS, TONE_RANGE, presetById } from "../instrument/presets.ts";
import type { Tone } from "../instrument/presets.ts";
import { clamp, noteName } from "../notes.ts";
import { nearestVowel } from "../scores.ts";
import { OCTAVE_KEYS, keyNote } from "../touch/keys.ts";
import { choice, slider } from "../ui/controls.ts";
import { mountKeys } from "../ui/keys.ts";
import { mountMidi } from "../ui/midi.ts";

export function mountInstrument(app: App): ModeParts {
  const { store, sound } = app;
  const s0 = store.get();
  const here = () => store.get().mode === "instrument";
  const player = createInstrumentalist(app);
  const play = (note: number, velocity?: number) => void sound.wake().then((ok) => ok && player.noteOn(note, velocity));

  // ── the controls ──
  const presets = choice({
    label: "Sound",
    options: PRESETS.map((p) => ({ value: p.id, label: p.name })),
    value: s0.preset,
    pick: (id) => {
      store.set({ preset: id, tone: presetById(id).tone });
      app.remark(presetById(id).does);
    },
  });
  presets.root.classList.add("presets");
  store.on(["preset"], (s) => presets.set(s.preset));

  /** A slider bound to one value of the tone. */
  const toned = (key: keyof Tone, label: string, show: (v: number) => string, ends?: [string, string]) => {
    const [min, max, step] = TONE_RANGE[key];
    const dial = slider({ label, min, max, step, value: s0.tone[key], show, ends, input: (v) => store.set({ tone: { ...store.get().tone, [key]: v } }) });
    store.on(["tone"], (s) => dial.set(s.tone[key]));
    return dial.root;
  };
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const seconds = (v: number) => `${v < 1 ? Math.round(v * 1000) + " ms" : v.toFixed(1) + " s"}`;
  const body = slider({
    label: "Body", min: 0, max: BODY_MAX, step: 0.05, value: s0.body, numeric: false,
    show: bodyName, input: (v) => store.set({ body: v }),
  });
  store.on(["body"], (s) => body.set(s.body));
  const midi = mountMidi(app, "instrument", {
    noteOn: (note, velocity) => player.noteOn(note + 12 * store.get().tone.octave, velocity),
    noteOff: (note) => player.noteOff(note + 12 * store.get().tone.octave),
    wheel: (amount) => store.set({ tone: { ...store.get().tone, vibrato: Math.round(amount * 80) } }),
  });

  const controls = el(
    "div.mode-controls",
    {},
    el("div.group.wide", {}, presets.root),
    el(
      "div.group",
      {},
      el("h2.group-title", {}, "Ensemble"),
      toned("unison", "Voices in unison", (v) => String(v)),
      toned("detune", "Detune", (v) => `${v} cents`),
      toned("spread", "Spread", percent),
    ),
    el(
      "div.group",
      {},
      el("h2.group-title", {}, "Shape"),
      toned("noise", "Breath", percent, ["pressed", "whisper"]),
      toned("vibrato", "Vibrato", (v) => `${v} cents`),
      toned("attack", "Attack", seconds),
      toned("release", "Release", seconds),
    ),
    el(
      "div.group",
      {},
      el("h2.group-title", {}, "Voice"),
      toned("octave", "Octave", (v) => (v > 0 ? `+${v}` : String(v))),
      toned("size", "Airway length", (v) => `${v.toFixed(2)}×`, ["tiny", "giant"]),
      body.root,
    ),
    el("div.group.wide", {}, el("h2.group-title", {}, "Playing"), midi),
  );

  // ── the surface: the vowel field and the keys ──
  const low = () => keyboardBase(store.get().body) + 12 * store.get().tone.octave;
  const keys = mountKeys({ low, press: (note) => play(note), release: (note) => player.noteOff(note) });
  store.on(["body", "tone"], (s, was) => {
    if (s === was || s.body !== was.body || s.tone.octave !== was.tone.octave) keys.relabel();
  });

  const spot = el("span.pad-spot");
  const letters = store.get().vowels.map((v) => ({ ph: v.ph, node: el("span.pad-vowel", { "aria-hidden": "true" }, v.ph) }));
  const field = el(
    "div.pad.vowel-field",
    {
      tabindex: 0,
      role: "slider",
      "aria-roledescription": "vowel field",
      "aria-label": "Vowel. Move to change the vowel every voice sings; arrow keys move it too.",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
    },
    el("span.pad-end.back", { "aria-hidden": "true" }, "back"),
    el("span.pad-end.front", { "aria-hidden": "true" }, "front"),
    ...letters.map((l) => l.node),
    spot,
  );
  const aimAt = (x: number, y: number) => store.set({ tone: { ...store.get().tone, x: clamp(x, 0, 1), y: clamp(y, 0, 1) } });
  let holder: number | null = null;
  const fromPointer = (event: PointerEvent) => {
    const box = field.getBoundingClientRect();
    aimAt((event.clientX - box.left) / box.width, 1 - (event.clientY - box.top) / box.height);
  };
  field.addEventListener("pointerdown", (event) => {
    holder = event.pointerId;
    try {
      field.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone.
    }
    fromPointer(event);
  });
  field.addEventListener("pointermove", (event) => holder === event.pointerId && fromPointer(event));
  const drop = (event: PointerEvent) => holder === event.pointerId && (holder = null);
  field.addEventListener("pointerup", drop);
  field.addEventListener("pointercancel", drop);
  field.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.04;
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = by[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    aimAt(store.get().tone.x + move[0], store.get().tone.y + move[1]);
  });
  store.on(["tone", "vowels"], (s) => {
    for (const l of letters) {
      const at = s.vowels.find((v) => v.ph === l.ph);
      if (!at) continue;
      l.node.style.left = `${at.x * 100}%`;
      l.node.style.bottom = `${at.y * 100}%`;
    }
    spot.style.left = `${s.tone.x * 100}%`;
    spot.style.bottom = `${s.tone.y * 100}%`;
    const near = nearestVowel(s.tone.x, s.tone.y, s.vowels);
    letters.forEach((l) => l.node.classList.toggle("near", l.ph === near));
    field.setAttribute("aria-valuenow", String(Math.round(s.tone.x * 100)));
    field.setAttribute("aria-valuetext", `Near ${near}`);
  });
  const surface = el("div.instrument-surface", {}, field, keys.root);

  // ── the computer keyboard, as a piano ──
  const down = new Map<string, number>();
  window.addEventListener("keydown", (event) => {
    if (!here() || typing() || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.activeElement?.classList.contains("key")) return;
    const octave = OCTAVE_KEYS[event.code];
    if (octave) {
      const tone = store.get().tone;
      const [lo, hi] = TONE_RANGE.octave;
      store.set({ tone: { ...tone, octave: clamp(tone.octave + octave, lo, hi) } });
      app.remark(`The keys A to ; now play ${noteName(low())} to ${noteName(low() + 16)}.`);
      return;
    }
    const note = keyNote(event.code, keyboardBase(store.get().body), store.get().tone.octave);
    if (note === null) return;
    event.preventDefault();
    down.set(event.code, note);
    play(note);
  });
  window.addEventListener("keyup", (event) => {
    const note = down.get(event.code);
    if (note === undefined) return;
    down.delete(event.code);
    player.noteOff(note);
  });
  window.addEventListener("blur", () => {
    down.forEach((note) => player.noteOff(note));
    down.clear();
  });
  store.on(["mode"], (s) => {
    if (s.mode === "instrument") return;
    down.clear();
    player.quiet();
  });

  return {
    controls,
    surface,
    shown: () => player.lead,
    frame() {
      player.frame();
      // A key is lit by the loudest voice singing its note.
      const swells = player.swells;
      const held = player.held;
      keys.light((note) => (held.includes(note) ? Math.max(0.3, ...swells) : 0));
      field.classList.toggle("voiced", swells.some((v) => v > 0.05));
    },
    readout() {
      return player.held.map(noteName).join(" ");
    },
  };
}
