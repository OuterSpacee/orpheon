// The body alone, full-window, driven by a voice that runs silently on this thread through a
// loop of poses. For looking at the view; nothing here ships.
//
// The address fixes the state for a picture:
//   layers=skin,air     only these parts (default: all)
//   solo=tongue         one part alone, the rest ghosts
//   explode=1  cut=1    0..1
//   yaw=40  pitch=10    degrees; yaw 0 is the profile facing right, 90 the face from the front
//   zoom=1.5
//   room=280,0,280,220  insets (left, top, right, bottom) the head must keep clear of, in CSS
//                       pixels, or with % a share of the window's width or height (0,0,0,40%);
//                       room=page is the page's own at this window size
//   pose=a              hold one pose instead of the loop: rest a i u s m n t(closed) sh ng
//   t=3.2               stop the clock at this many seconds
//   step=0..7           pin the load-shedding step (0 = everything)
//   bench=60            draw this many frames flat out and report the time each took
//   cast=4              a choir of this many singers (soprano, alto, tenor, bass, child, tenor),
//                       each its own voice going round the loop a little behind the one before
//   quiet=1,3           these singers of the choir stay silent
//   enter=2             singer i starts singing i times this many seconds in (default 0)
//   hud=0               no text
//   density=0.67        how thick the cloud is (0.05..1); colour=1  every part its own colour
//   lids=0.5            hold the eyelids this much closed (0 open .. 1 shut) instead of blinking
import { BODIES, LAYERS, NOSE_POINTS, POSE, TELEMETRY as T, TELEMETRY_SIZE, TRACT_POINTS, type Body, type LayerId, type Pose } from "../src/contract.ts";
import { createAnatomyView } from "../src/view/index.ts";
import { createVoice } from "../src/voice/index.ts";

const RATE = 48000;
const query = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (query.has(name) ? Number(query.get(name)) : fallback);

const POSES: Record<string, Partial<Pose>> = {
  rest: { lungs: 0, glottis: 1, jaw: 0.25, tongueX: 0.5, tongueY: 0.4, tip: 0, lips: 0.5, round: 0.2, velum: 1 },
  a: { lungs: 0.6, glottis: 0.5, jaw: 0.85, tongueX: 0.3, tongueY: 0.1, tip: 0, lips: 0.95, round: 0, velum: 0, pitch: 196 },
  i: { lungs: 0.6, glottis: 0.5, jaw: 0.2, tongueX: 0.92, tongueY: 0.95, tip: 0, lips: 0.7, round: 0, velum: 0, pitch: 262 },
  u: { lungs: 0.6, glottis: 0.5, jaw: 0.25, tongueX: 0.25, tongueY: 0.9, tip: 0, lips: 0.22, round: 1, velum: 0, pitch: 220 },
  s: { lungs: 0.6, glottis: 1, jaw: 0.08, tongueX: 0.8, tongueY: 0.55, tip: 0.77, tipX: 0.5, lips: 0.6, round: 0, velum: 0 },
  sh: { lungs: 0.6, glottis: 1, jaw: 0.1, tongueX: 0.8, tongueY: 0.5, tip: 0.76, tipX: 1, lips: 0.5, round: 0.7, velum: 0 },
  m: { lungs: 0.5, glottis: 0.5, jaw: 0.15, tongueX: 0.5, tongueY: 0.3, tip: 0, lips: 0, round: 0, velum: 1, pitch: 196 },
  n: { lungs: 0.5, glottis: 0.5, jaw: 0.2, tongueX: 0.7, tongueY: 0.5, tip: 1, tipX: 0.5, lips: 0.6, round: 0, velum: 1, pitch: 196 },
  ng: { lungs: 0.5, glottis: 0.5, jaw: 0.3, tongueX: 0.3, tongueY: 1, tip: 0, lips: 0.6, round: 0, velum: 1, pitch: 196 },
  t: { lungs: 0.6, glottis: 1, jaw: 0.15, tongueX: 0.7, tongueY: 0.5, tip: 1, tipX: 0.5, lips: 0.6, round: 0, velum: 0 },
};
/** The loop: what to do and for how long. */
const LOOP: [string, number][] = [
  ["rest", 1.2], ["a", 1.4], ["i", 1.3], ["u", 1.3], ["s", 1.1], ["a", 0.7], ["m", 1.1], ["a", 0.7], ["t", 0.45], ["a", 0.8], ["sh", 0.9], ["i", 0.7], ["n", 0.9], ["rest", 1.2],
];
const LOOP_LENGTH = LOOP.reduce((sum, [, d]) => sum + d, 0);

const canvas = document.querySelector<HTMLCanvasElement>("#body")!;
const note = document.querySelector<HTMLElement>("#note")!;
const view = createAnatomyView(canvas);
const voice = createVoice(RATE);
const telemetry = new Float32Array(TELEMETRY_SIZE);
const block = new Float32Array(4096);

// ── a choir, if the address asks for one: more voices, each behind the one before ──
const CHOIR: Body[] = [BODIES.soprano, BODIES.alto, BODIES.tenor, BODIES.bass, BODIES.child, BODIES.tenor];
const CHOIR_NAMES = ["Soprano", "Alto", "Tenor", "Bass", "Child", "Tenor 2"];
const castSize = Math.max(1, Math.min(6, number("cast", 1)));
const quiet = new Set((query.get("quiet") ?? "").split(",").filter(Boolean).map(Number));
const enter = number("enter", 0);
const others = Array.from({ length: castSize - 1 }, (_, i) => ({ voice: createVoice(RATE, CHOIR[i + 1]), telemetry: new Float32Array(TELEMETRY_SIZE) }));
if (castSize > 1) {
  voice.setBody(CHOIR[0]);
  view.cast(CHOIR.slice(0, castSize).map((body, i) => ({ name: CHOIR_NAMES[i], body })));
}
/** Aim choir singer i (1..) at its place in the loop: a little behind the one before, silent until it enters. */
function aimOther(i: number): void {
  const v = others[i - 1].voice;
  const t = v.time - i * enter;
  if (quiet.has(i) || t < 0) return v.aim(POSES.rest);
  let left = (t + i * 0.9) % LOOP_LENGTH;
  for (const [name, length] of LOOP) {
    if (left < length) return v.aim(POSES[name]);
    left -= length;
  }
}
function runOthers(samples: number): void {
  others.forEach((o, k) => {
    aimOther(k + 1);
    let left = samples;
    while (left > 0) {
      const n = Math.min(left, block.length);
      o.voice.render(n === block.length ? block : block.subarray(0, n));
      left -= n;
    }
    o.voice.sense(o.telemetry);
    view.frameOf(k + 1, o.telemetry);
  });
}

// ── standing in for what the placeholder voice does not report ──
// The placeholder's tube ignores the lips and the tongue tip and reports no hiss, no nose and no
// held pressure. Find out once whether this voice is like that; if so, fill those in here so the
// view has them to show. A real engine is left alone.
const stand = (() => {
  const probe = createVoice(RATE);
  const seen = new Float32Array(TELEMETRY_SIZE);
  probe.aim({ lips: 0, lungs: 0.5 });
  for (let i = 0; i < 6; i++) probe.render(block);
  probe.sense(seen);
  return query.has("fake") ? query.get("fake") === "1" : seen[T.area + TRACT_POINTS - 1] > 0.04;
})();
let heldNow = 0;

function standIn(dt: number): void {
  const pose = (key: keyof Pose) => telemetry[T.pose + POSE[key]];
  const last = TRACT_POINTS - 1;
  // The tip closes the tube where it points; the lips close its end.
  const tipAt = pose("tipX") < 0.5 ? 0.95 - 0.12 * pose("tipX") : 0.89 - 0.1 * (pose("tipX") - 0.5);
  let tight = last;
  for (let i = 0; i < TRACT_POINTS; i++) {
    const s = i / last;
    let area = telemetry[T.area + i];
    if (area <= 0.051) area = 0.3;
    area *= 1 - pose("tip") * Math.exp(-(((s - tipAt) / 0.022) ** 2));
    if (s > 0.94) area *= pose("lips") * (1 - 0.5 * pose("round")) * 1.4;
    telemetry[T.area + i] = area;
    if (s > 0.4 && area < telemetry[T.area + tight]) tight = i;
  }
  const gap = telemetry[T.area + tight];
  const shut = gap < 0.03;
  const breath = pose("lungs");
  const voiceless = pose("glottis") > 0.85;
  const nasal = pose("velum");
  // Folds apart: breath but no voice.
  if (voiceless) {
    telemetry[T.voiced] = 0;
    telemetry[T.f0] = 0;
    telemetry[T.flow] = breath * 0.8;
  }
  if (shut && nasal < 0.1) telemetry[T.flow] = 0;
  // Hiss just in front of a narrow gap that air is forced through.
  const hiss = !shut && gap < 0.5 ? (1 - gap / 0.5) * Math.min(1, telemetry[T.flow] * 2.5) : 0;
  for (let i = 0; i < TRACT_POINTS; i++) {
    const ahead = i - tight;
    telemetry[T.noise + i] = ahead >= 0 ? hiss * Math.exp(-ahead / 2.5) : hiss * Math.exp(ahead / 0.7);
    if (voiceless) telemetry[T.pressure + i] *= 0.15;
    telemetry[T.pressure + i] = Math.max(telemetry[T.pressure + i], telemetry[T.noise + i] * 0.4);
  }
  // Pressure builds behind a closure and is let go when it opens.
  const building = shut && nasal < 0.1 ? breath : 0;
  heldNow += (building - heldNow) * (1 - Math.exp(-dt / (building > heldNow ? 0.08 : 0.03)));
  telemetry[T.held] = heldNow;
  telemetry[T.level] = voiceless ? hiss * 0.35 : shut && nasal < 0.1 ? 0 : breath * (shut ? 0.6 : 1);
  // The nose: always there, its door as open as the soft palate is low.
  for (let i = 0; i < NOSE_POINTS; i++) {
    const t = i / (NOSE_POINTS - 1);
    const open = 0.4 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8;
    telemetry[T.noseArea + i] = t < 0.12 ? open * nasal : open;
    telemetry[T.nosePressure + i] = voiceless ? 0 : breath * nasal * Math.abs(Math.cos(Math.PI * (1.1 * t + 0.2)));
  }
}

// ── the loop of poses ──
const fixed = query.get("pose");
function aimAt(time: number): string {
  if (castSize > 1 && quiet.has(0)) {
    voice.aim(POSES.rest);
    return "rest";
  }
  if (fixed && POSES[fixed]) {
    voice.aim(POSES[fixed]);
    return fixed;
  }
  let t = time % LOOP_LENGTH;
  for (const [name, length] of LOOP) {
    if (t < length) {
      voice.aim(POSES[name]);
      return name;
    }
    t -= length;
  }
  return "rest";
}

let saying = "rest";
function advance(dt: number): void {
  saying = aimAt(voice.time);
  let left = Math.round(dt * RATE);
  while (left > 0) {
    const n = Math.min(left, block.length);
    voice.render(n === block.length ? block : block.subarray(0, n));
    left -= n;
  }
  voice.sense(telemetry);
  if (stand) standIn(dt);
  view.frame(telemetry);
  runOthers(Math.round(dt * RATE));
}

// ── the state the address asks for ──
const layers = query.get("layers")?.split(",");
if (layers) for (const layer of LAYERS) view.layer(layer.id, layers.includes(layer.id) ? 1 : 0);
if (query.has("solo")) view.solo(query.get("solo") as LayerId);
view.explode(number("explode", 0));
view.cut(number("cut", 0));
view.look((number("yaw", 0) * Math.PI) / 180, (number("pitch", 0) * Math.PI) / 180, number("zoom", 1));
if (query.has("step")) view.pin(number("step", 0));
if (query.has("density")) view.density(number("density", 0.67));
if (query.has("colour")) view.colour(number("colour", 0));
if (query.has("lids")) view.lids(number("lids", 0));

/** The insets the address asks for, in CSS pixels. */
function roomAsked(): [number, number, number, number] {
  const asked = query.get("room");
  if (!asked) return [0, 0, 0, 0];
  const w = innerWidth;
  const h = innerHeight;
  // Roughly what the page covers: parts list left, mode controls right, the pad, caption and
  // transport at the bottom; on a phone the bottom sheet only.
  if (asked === "page") return w < 700 ? [0, 56, 0, Math.round(h * 0.4)] : [280, 56, 280, 220];
  const v = asked.split(",").map((part, i) => (part.endsWith("%") ? (parseFloat(part) / 100) * (i % 2 ? h : w) : Number(part)));
  return [v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 0];
}
const room = roomAsked();
view.room(...room);
addEventListener("resize", () => view.room(...roomAsked()));

let hovered: LayerId | null = null;
/** What the pointer has asked of the voice, newest last (for tools/view-grab.ts). */
const grabs: Partial<Pose>[] = [];
view.onHover = (id) => (hovered = id);
view.onGrab = (pose) => {
  grabs.push(pose);
  if (grabs.length > 50) grabs.shift();
  voice.aim(pose);
};

/** With the clock stopped (t=…): move the voice and the view on by `dt` seconds together, for a film made frame by frame. */
function step(dt: number): void {
  advance(dt);
  view.advance(dt);
}
const lab = { view, telemetry, grabs, hovered: () => hovered, ready: false, ms: 0, dust: 0, stats: () => ({ ...view.stats(), ms: lab.ms, dust: lab.dust, saying, stand }), picture, step };
Object.assign(window, { lab });

function describe(): void {
  if (query.get("hud") === "0") return;
  const s = view.stats();
  const part = LAYERS.find((l) => l.id === hovered);
  note.innerHTML =
    `<b>${saying}</b>   ${s.frame.toFixed(1)} ms   ${(s.drawn / 1000).toFixed(0)}k of ${(s.particles / 1000).toFixed(0)}k particles   ${s.width}×${s.height}` +
    (part ? `\n${part.name}: ${part.does}` : "");
}

const stopAt = number("t", -1);
await view.ready;
if (stopAt >= 0) {
  // Run the voice to just before the moment, then the last second with the view watching, so
  // its easing and its memory of the sound are as they would be.
  view.hold(true);
  const step = 1 / 60;
  while (voice.time < stopAt - 1) {
    saying = aimAt(voice.time);
    voice.render(block);
    voice.sense(telemetry);
    if (stand) standIn(block.length / RATE);
    runOthers(block.length);
  }
  while (voice.time < stopAt) {
    advance(step);
    view.advance(step);
  }
  // A few more frames at the frozen moment let the camera and the layers finish easing.
  for (let i = 0; i < 90; i++) view.advance(step);
  finish();
  // Keep presenting the same instant, so the page stays alive for a picture or for turning the head.
  const again = () => {
    view.advance(0);
    requestAnimationFrame(again);
  };
  requestAnimationFrame(again);
} else {
  let last = performance.now();
  let frames = 0;
  const tick = (now: number) => {
    advance(Math.min(0.05, (now - last) / 1000));
    last = now;
    if (++frames % 20 === 0) describe();
    if (frames === 30) finish();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * The canvas as a PNG, read right after a frame is drawn, with the room asked for outlined (for
 * tools/view-shots.ts: a screenshot of the window can wait forever on a busy card).
 */
function picture(): string {
  view.advance(0);
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const c = copy.getContext("2d")!;
  c.drawImage(canvas, 0, 0);
  const [l, t, r, b] = roomAsked();
  if (l + t + r + b > 0) {
    const k = canvas.width / innerWidth;
    c.fillStyle = "rgba(138, 147, 184, 0.10)";
    c.fillRect(0, 0, l * k, copy.height);
    c.fillRect(copy.width - r * k, 0, r * k, copy.height);
    c.fillRect(l * k, copy.height - b * k, copy.width - (l + r) * k, b * k);
    c.fillRect(l * k, 0, copy.width - (l + r) * k, t * k);
  }
  return copy.toDataURL("image/png");
}

function finish(): void {
  if (query.has("bench")) {
    // Once as it is, once with the particles drawn four times: a third of the difference is the
    // particles' own cost, free of what waiting for the card adds to every measured frame.
    const frames = number("bench", 60);
    lab.ms = view.measure(frames);
    lab.dust = (view.measure(frames, 4) - lab.ms) / 3;
  }
  describe();
  lab.ready = true;
}

// A few keys, for trying things by hand: 1..9 and 0 show or hide a part, shift with them shows
// it alone, x takes the body apart, c cuts it.
let apart = number("explode", 0);
let sliced = number("cut", 0);
const on = LAYERS.map((l) => !layers || layers.includes(l.id));
let alone: LayerId | null = (query.get("solo") as LayerId) ?? null;
window.addEventListener("keydown", (e) => {
  const i = "1234567890".indexOf(e.key);
  const shifted = "!@#$%^&*()".indexOf(e.key);
  if (i >= 0) view.layer(LAYERS[i].id, (on[i] = !on[i]) ? 1 : 0);
  else if (shifted >= 0) view.solo((alone = alone === LAYERS[shifted].id ? null : LAYERS[shifted].id));
  else if (e.key === "x") view.explode((apart = apart > 0.5 ? 0 : 1));
  else if (e.key === "c") view.cut((sliced = sliced > 0.5 ? 0 : 1));
});
