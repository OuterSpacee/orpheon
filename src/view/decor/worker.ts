// The worker that makes what the singers wear, off the page's thread: a hat is a few hundred
// milliseconds of arithmetic on a phone, and the head must not stop while it is made.
import { makeItem } from "./items.ts";
import type { ItemId } from "./outfit.ts";

const post = (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage.bind(self);
self.onmessage = (e: MessageEvent<ItemId>) => {
  const part = makeItem(e.data);
  post(part, [part.floats.buffer, part.bytes.buffer, part.marks.buffer]);
};
