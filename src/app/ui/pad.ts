// The vowel pad: hold it to voice, move within it to move the tongue. Forward is to the right,
// as the head on the stage faces; high is up. The vowels sit where the tongue makes them.
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import { clamp } from "../notes.ts";
import { PAD_VOWELS, mouthFor, nearestVowel } from "../scores.ts";
import type { Player } from "../touch/player.ts";

export function mountPad(app: App, player: Player): HTMLElement {
  const { store, sound } = app;
  const spot = el("span.pad-spot");
  const vowels = PAD_VOWELS.map((ph) => ({ ph, node: el("span.pad-vowel", { "aria-hidden": "true" }, ph) }));
  // Each vowel sits where this voice forms it; when the engine has been asked, they drift there.
  store.on(["vowels"], (s) => {
    for (const v of vowels) {
      const spot = s.vowels.find((spot) => spot.ph === v.ph);
      v.node.hidden = !spot;
      if (!spot) continue;
      v.node.style.left = `${spot.x * 100}%`;
      v.node.style.bottom = `${spot.y * 100}%`;
    }
  });
  const pad = el(
    "div.pad",
    {
      tabindex: 0,
      role: "slider",
      "aria-roledescription": "vowel pad",
      "aria-label": "Vowel pad. Hold to voice; move to change the vowel. Arrow keys move the tongue, Space holds the voice.",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
    },
    el("span.pad-end.back", { "aria-hidden": "true" }, "back"),
    el("span.pad-end.front", { "aria-hidden": "true" }, "front"),
    ...vowels.map((v) => v.node),
    spot,
  );

  function move(x: number, y: number): void {
    const pose = { ...store.get().pose, tongueX: clamp(x, 0, 1), tongueY: clamp(y, 0, 1) };
    if (store.get().follow) Object.assign(pose, mouthFor(pose.tongueX, pose.tongueY, store.get().vowels));
    store.set({ pose });
  }
  const fromPointer = (event: PointerEvent) => {
    const box = pad.getBoundingClientRect();
    move((event.clientX - box.left) / box.width, 1 - (event.clientY - box.top) / box.height);
  };

  // Which pointer is holding the pad, if any: the hold follows it even when it slides off the pad.
  let holder: number | null = null;
  pad.addEventListener("pointerdown", async (event) => {
    holder = event.pointerId;
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      // No capture (the pointer is already gone): the hold simply ends when it leaves the pad.
    }
    fromPointer(event);
    await sound.wake();
    if (holder === event.pointerId) player.hold("pad", true);
  });
  pad.addEventListener("pointermove", (event) => {
    if (holder === event.pointerId) fromPointer(event);
  });
  const lift = (event: PointerEvent) => {
    if (holder !== event.pointerId) return;
    holder = null;
    player.hold("pad", false);
  };
  pad.addEventListener("pointerup", lift);
  pad.addEventListener("pointercancel", lift);
  pad.addEventListener("lostpointercapture", lift);

  pad.addEventListener("keydown", (event) => {
    const { tongueX, tongueY } = store.get().pose;
    const step = event.shiftKey ? 0.1 : 0.04;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const by = moves[event.key];
    if (!by) return;
    event.preventDefault();
    move(tongueX + by[0], tongueY + by[1]);
  });

  store.on(["pose", "vowels"], (s) => {
    const { tongueX: x, tongueY: y } = s.pose;
    spot.style.left = `${x * 100}%`;
    spot.style.bottom = `${y * 100}%`;
    const near = nearestVowel(x, y, s.vowels);
    vowels.forEach((v) => v.node.classList.toggle("near", v.ph === near));
    pad.setAttribute("aria-valuenow", String(Math.round(x * 100)));
    pad.setAttribute("aria-valuetext", `Tongue ${Math.round(x * 100)}% forward, ${Math.round(y * 100)}% high, near ${near}`);
  });

  return pad;
}
