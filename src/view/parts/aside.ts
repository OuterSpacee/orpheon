// Making the skin and the skull takes a second or two of arithmetic, so the page does not do it
// itself: a worker makes the parts and hands each over as it is finished, quick ones first. The
// airway is there almost at once and the head condenses around it.
import type { Part } from "../dust.ts";
import { BUILT, MAKING_ORDER, makePart } from "./index.ts";

/**
 * Make every part in a worker, handing each to `take` as it is ready. If there can be no worker,
 * make them here instead, one per turn of the event loop. Returns a way to stop.
 */
export function makeBodyAside(take: (part: Part) => void): () => void {
  let stopped = false;
  let worker: Worker | null = null;
  const here = () => {
    const left = [...MAKING_ORDER];
    const next = () => {
      const id = left.shift();
      if (stopped || !id) return;
      take(makePart(id, BUILT));
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  };
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Part>) => {
      if (!stopped) take(e.data);
    };
    worker.onerror = () => {
      // The worker could not start (an old browser, a strict page): do the work here.
      worker?.terminate();
      worker = null;
      if (!stopped) here();
    };
  } catch {
    here();
  }
  return () => {
    stopped = true;
    worker?.terminate();
  };
}
