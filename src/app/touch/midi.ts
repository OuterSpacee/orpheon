// A MIDI keyboard, if one is plugged in. The browser asks the person before letting a page
// listen, so the page only asks when it is told to (or when it has been allowed before).

export interface MidiEvents {
  /** `velocity` 0..1. */
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  /** The modulation wheel, 0..1. */
  wheel(amount: number): void;
  /** The names of the keyboards being listened to; empty when none is plugged in. */
  devices(names: string[]): void;
}

export const midiSupported = (): boolean => typeof navigator.requestMIDIAccess === "function";

/** Has the person already said yes to MIDI on this site? */
export async function midiAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "midi" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/** Start listening. Rejects if the person says no. */
export async function listenToMidi(events: MidiEvents): Promise<void> {
  const access = await navigator.requestMIDIAccess();
  const hear = (message: MIDIMessageEvent) => {
    const data = message.data;
    if (!data || data.length < 3) return;
    const kind = data[0] & 0xf0;
    // A note-on with no velocity is how many keyboards say note-off.
    if (kind === 0x90 && data[2] > 0) events.noteOn(data[1], data[2] / 127);
    else if (kind === 0x80 || kind === 0x90) events.noteOff(data[1]);
    else if (kind === 0xb0 && data[1] === 1) events.wheel(data[2] / 127);
  };
  const attach = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = hear;
      names.push(input.name ?? "a keyboard");
    });
    events.devices(names);
  };
  access.onstatechange = attach;
  attach();
}
