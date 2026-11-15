// A strip of keys to click or touch: two octaves, each key a hairline, the black keys shorter and
// set higher as on a piano. Several fingers play several notes. A key warms while it sounds.
import { el } from "../dom.ts";
import { noteName } from "../notes.ts";

export interface Keys {
  root: HTMLElement;
  /** Call when the lowest note changes. */
  relabel(): void;
  /** Light the keys that sound now: each note's loudness 0..1. */
  light(level: (note: number) => number): void;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
/** Keys shown: two octaves and the C above. */
const COUNT = 25;

export function mountKeys(spec: { low: () => number; press: (note: number) => void; release: (note: number) => void }): Keys {
  const keys: HTMLButtonElement[] = [];
  const root = el("div.keys", { role: "group", "aria-label": "Keys. Press and hold to sing a note; several at once sing a chord." });
  for (let i = 0; i < COUNT; i++) {
    const key = el(BLACK.has(i % 12) ? "button.key.black" : "button.key", { type: "button" }, el("span.key-name"));
    keys.push(key);
    root.append(key);
  }

  /** The note under each pointer that is down. */
  const down = new Map<number, number>();
  const noteOf = (key: HTMLButtonElement) => spec.low() + keys.indexOf(key);
  const lift = (event: PointerEvent) => {
    const note = down.get(event.pointerId);
    if (note === undefined) return;
    down.delete(event.pointerId);
    spec.release(note);
  };
  keys.forEach((key) => {
    key.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      try {
        key.setPointerCapture(event.pointerId);
      } catch {
        // No capture: the note ends when the pointer leaves the key.
      }
      const note = noteOf(key);
      down.set(event.pointerId, note);
      spec.press(note);
    });
    key.addEventListener("pointerup", lift);
    key.addEventListener("pointercancel", lift);
    key.addEventListener("lostpointercapture", lift);
    // The keyboard plays a key too: Enter or Space holds it while it is down.
    key.addEventListener("keydown", (event) => {
      if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      spec.press(noteOf(key));
    });
    key.addEventListener("keyup", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.stopPropagation();
      spec.release(noteOf(key));
    });
  });

  function relabel(): void {
    const low = spec.low();
    keys.forEach((key, i) => {
      const name = noteName(low + i);
      key.setAttribute("aria-label", name);
      // Only the Cs are named, as on the wood above a piano's keys.
      (key.firstElementChild as HTMLElement).textContent = (low + i) % 12 === 0 ? name : "";
    });
  }
  relabel();

  return {
    root,
    relabel,
    light(level) {
      const low = spec.low();
      keys.forEach((key, i) => {
        const v = level(low + i);
        key.style.setProperty("--level", v.toFixed(2));
        key.classList.toggle("on", v > 0.02);
      });
    },
  };
}
