// The worker that makes the body's particles off the page's own thread (see index.ts here).
import { BUILT, MAKING_ORDER, makePart } from "./index.ts";

const post = (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage.bind(self);
for (const id of MAKING_ORDER) {
  const part = makePart(id, BUILT);
  post(part, [part.floats.buffer, part.bytes.buffer, part.marks.buffer]);
}
