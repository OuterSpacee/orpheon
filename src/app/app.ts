// What the parts of the page share: the state, the sound, and the few things one part asks of
// another. main.ts builds it; everything else receives it.
import type { Pose } from "../contract.ts";
import type { Sound } from "./audio/sound.ts";
import type { Performance, State } from "./state.ts";
import type { Store } from "./store.ts";

export interface App {
  store: Store<State>;
  sound: Sound;
  /** Say something in passing on the guide line. It clears itself after a few seconds. */
  remark(text: string): void;
  /** Start a spoken or sung performance on the first voice. */
  begin(performance: Performance): void;
  /** Stop it. */
  stop(): void;
  /** Seconds into the performance as heard now, or -1 when nothing is playing. */
  position(): number;
  /** The seat whose body the stage is showing. */
  shown(): number;
  /** The view reports a part of the body being dragged, and the drag ending. */
  grab(pose: Partial<Pose>): void;
  letGo(): void;
}

/** What each mode gives the page. */
export interface ModeParts {
  /** Its controls, for the right edge. */
  controls: HTMLElement;
  /** What it puts at the bottom, above the transport. */
  surface: HTMLElement;
  /** What the transport's main button does and says, if the mode has one. */
  go?: { label: string; act: () => void };
  /** Try again whatever last failed to load (the guide line offers it). */
  retry?: () => void;
  /** What the transport shows beside the main button when nothing is being performed. */
  readout?: () => string;
  /** Called on every animation frame while the mode is the current one. */
  frame?: () => void;
  /** The seat the stage shows when it shows one head (left out, the first). */
  shown?: () => number;
}
