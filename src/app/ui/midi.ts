// One MIDI connection for the whole page. Each mode that plays notes says what it does with
// them; the notes go to the mode that is showing. The browser asks the person before a page may
// listen, so the page only asks when told to (or when it has been allowed before).
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import type { Mode } from "../state.ts";
import { listenToMidi, midiAllowed, midiSupported } from "../touch/midi.ts";
import { action } from "./controls.ts";

export interface NoteReceiver {
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  /** The modulation wheel, 0..1. */
  wheel?(amount: number): void;
}

const receivers = new Map<Mode, NoteReceiver>();
let started = false;

/** Start listening, once for the page. */
async function listen(app: App): Promise<void> {
  const { store } = app;
  const to = () => receivers.get(store.get().mode);
  try {
    await listenToMidi({
      noteOn: (note, velocity) => void app.sound.wake().then((ok) => ok && to()?.noteOn(note, velocity)),
      // Every receiver hears a key come up: a mode left while the key was down still lets go.
      noteOff: (note) => receivers.forEach((r) => r.noteOff(note)),
      wheel: (amount) => to()?.wheel?.(amount),
      devices: (names) => store.set({ midi: names.length ? "listening" : "none", midiName: names.join(", ") }),
    });
  } catch {
    store.set({ midi: "refused" });
  }
}

/** Let `mode` play from a MIDI keyboard. Returns the button that asks to listen, and the line that says how it is going. */
export function mountMidi(app: App, mode: Mode, receiver: NoteReceiver): HTMLElement {
  const { store } = app;
  receivers.set(mode, receiver);
  if (!started) {
    started = true;
    if (!midiSupported()) store.set({ midi: "unsupported" });
    else void midiAllowed().then((yes) => (yes ? listen(app) : store.set({ midi: "ask" })));
  }
  const line = el("p.midi");
  const connect = action("Listen for a MIDI keyboard", () => void listen(app));
  store.on(["midi", "midiName"], (s) => {
    connect.hidden = s.midi !== "ask";
    line.hidden = s.midi === "ask" || s.midi === "unknown" || s.midi === "unsupported";
    line.textContent =
      s.midi === "listening" ? `Listening to ${s.midiName}.`
      : s.midi === "none" ? "No MIDI keyboard is plugged in. Plug one in and it will be heard."
      : s.midi === "refused" ? "The browser did not allow MIDI. Allow it in the site settings to play from a keyboard."
      : "";
  });
  return el("div.midi-line", {}, connect, line);
}
