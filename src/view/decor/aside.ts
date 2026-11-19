// What is worn is made in a worker when it is first asked for (see worker.ts), and handed over
// when it is ready. If there can be no worker it is made here, one item per turn of the event loop.
import type { Part } from "../dust.ts";
import { makeItem } from "./items.ts";
import type { ItemId } from "./outfit.ts";

/** Returns a way to ask for an item (asking again for one on its way does nothing), and a way to stop. */
export function makeWornAside(take: (part: Part<ItemId>) => void): { ask(id: ItemId): void; stop(): void } {
  const asked = new Set<ItemId>();
  let stopped = false;
  let worker: Worker | null = null;
  const here = (id: ItemId) =>
    setTimeout(() => {
      if (!stopped) take(makeItem(id));
    }, 0);
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Part<ItemId>>) => {
      if (!stopped) take(e.data);
    };
    worker.onerror = () => {
      // The worker could not start: make here whatever it was asked for.
      worker?.terminate();
      worker = null;
      for (const id of asked) here(id);
    };
  } catch {
    worker = null;
  }
  return {
    ask(id) {
      if (stopped || asked.has(id)) return;
      asked.add(id);
      if (worker) worker.postMessage(id);
      else here(id);
    },
    stop() {
      stopped = true;
      worker?.terminate();
    },
  };
}
