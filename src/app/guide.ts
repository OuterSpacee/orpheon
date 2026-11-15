// The one quiet line under the stage. Whatever state the page is in, it says what is happening
// and what to do next. A pure function of the state, so every state can be checked by a test.
import { songById } from "./songs.ts";
import { LANGS } from "./state.ts";
import type { State } from "./state.ts";

export interface Guide {
  text: string;
  /** Something has gone wrong and wants attention. */
  trouble?: boolean;
  /** A thing the person can do about it, offered beside the words. */
  offer?: { label: string; act: "wake" | "reread" };
  /** The first thing to do on the page: said larger. */
  first?: boolean;
}

export function guide(s: State): Guide {
  if (s.audio === "failed") return { text: s.audioWhy, trouble: true, offer: { label: "Try again", act: "wake" } };
  if (s.saving !== null) return { text: `Rendering the file: ${Math.round(s.saving * 100)}%` };
  if (s.remark) return { text: s.remark };
  if (s.audio === "waking") return { text: "Waking the voice…" };

  if (s.mode === "touch") {
    if (s.audio === "asleep") return { text: "The voice is asleep. Tap anywhere, or press a key, to wake it.", offer: { label: "Wake the voice", act: "wake" }, first: true };
    return { text: "Hold the pad, or the keys A to L, to give it voice. Drag the body to shape it." };
  }

  if (s.mode === "instrument") {
    if (s.audio === "asleep") return { text: "The voice is asleep. Tap anywhere, or press a key, to wake it.", offer: { label: "Wake the voice", act: "wake" }, first: true };
    return { text: "Play the keys A to ; (Z and X for octaves), the strip, or a MIDI keyboard: several at once sing a chord." };
  }

  if (s.mode === "speak") {
    if (s.reading === "failed") {
      return {
        text: `The ${LANGS[s.lang]} dictionary did not load. Check the connection, then try again.`,
        trouble: true,
        offer: { label: "Try again", act: "reread" },
      };
    }
    if (s.reading === "loading") return { text: `Learning to read ${LANGS[s.lang]}…` };
    if (s.playing) return { text: "" };
    if (!s.text.trim()) return { text: "Type something for the voice to say." };
    return { text: "Press Speak, or Ctrl and Enter in the text." };
  }

  if (s.wording) return { text: "One syllable to a note: “-” splits a word, “_” holds a syllable over one more note, “~” keeps two on one note." };
  if (s.importing === "reading") return { text: "Reading the file…" };
  if (s.importing === "failed") return { text: `${s.importWhy} Choose a .mid or .kar file.`, trouble: true };
  if (s.song === "imported") return { text: s.imported ? "From your file. It stays in this browser: a link cannot carry it." : "Choose a song." };
  return { text: songById(s.song)?.credit ?? "Choose a song." };
}
