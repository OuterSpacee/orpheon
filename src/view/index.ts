// The body, drawn: a head of dust in which every part of the voice can be seen at work.
//
// The particles are made once (parts/), kept on the graphics card, and never rewritten. Each
// frame the telemetry is turned into a few numbers and one small texture (moving.ts) and the
// vertex shader moves every particle from those (shaders.ts).
//
// A choir is the same particles drawn once for each singer (cast.ts): each with its own
// telemetry, its own rows of the body texture, and its own place on the stage.
import { LAYERS, type AnatomyView, type Body, type LayerId, type Pose } from "../contract.ts";
import { JAW_PIVOT } from "./body.ts";
import { land, makeEye, see } from "./camera.ts";
import { CAST_MAX, RESTING, arrange, makeSeat, placePoint, settleSeat } from "./cast.ts";
import { frameStep } from "./framing.ts";
import { BYTES, FLOATS, type Part } from "./dust.ts";
import { makeCanvas, program, sizeCanvas, uniforms } from "./gl.ts";
import { BUILT, DENSITY_USUAL, STYLE } from "./layers.ts";
import { BODY_ROWS, makeMoving } from "./moving.ts";
import { makeBodyAside } from "./parts/aside.ts";
import { makePointer } from "./pointer.ts";
import { makePace } from "./pace.ts";
import { BLUR_FRAGMENT, DUST_FRAGMENT, DUST_VERTEX, FINISH_FRAGMENT, SCREEN_VERTEX, SHRINK_FRAGMENT } from "./shaders.ts";
import { N } from "./tract.ts";
import { Motion, type HeadInput, type MotionSpec } from "./motion.ts";
import { Eyes } from "./eyes.ts";
import { TELEMETRY } from "../contract.ts";
import { ITEM_STYLE, SHADE, coverOf } from "./decor/items.ts";
import { makeWornAside } from "./decor/aside.ts";
import { BARE, itemsOf, type ItemId, type Outfit } from "./decor/outfit.ts";

/** What the view offers beyond the contract, for the lab page and for measuring. */
export interface AnatomyViewLab extends AnatomyView {
  /**
   * Keep the head clear of the page's controls: insets in CSS pixels from each edge of the canvas.
   * The whole head (crown to the bottom of the neck, nose tip to the back of the skull, at the
   * current camera) is fitted inside what is left and centred in it, easing when this changes.
   * A part shown alone, or the body taken apart, is fitted the same way.
   */
  room(left: number, top: number, right: number, bottom: number): void;
  /**
   * Who is on the stage: one singer is the solo head; more (up to six) stand as a small choir,
   * each head the size of its body, all framed together inside room(). A change eases: heads
   * drift into their places, newcomers rise in, leavers fade. Layers, solo, cut and explode
   * apply to every head. In a choir a silent singer rests dim and lights up as it sings.
   */
  cast(singers: Singer[]): void;
  /** Hand over one singer's newest telemetry (frame() is singer 0's). */
  frameOf(index: number, telemetry: Float32Array): void;
  /**
   * Where a singer's head is on the canvas, in CSS pixels: x, y the point just under its chin
   * (where a name can be written), size its height from the crown to there. Null for a singer
   * not in the cast.
   */
  spot(index: number): { x: number; y: number; size: number } | null;
  /** Called when the pointer moves onto or off a singer's head (its index in the cast, or -1). */
  onSinger: ((index: number) => void) | null;
  /**
   * Draw `frames` frames back to back, waiting for the card each time; the milliseconds one took.
   * Waiting for the card has a cost of its own, so `dust` draws the particles that many times
   * over in each frame: the difference between two runs is what the particles alone cost.
   */
  measure(frames: number, dust?: number): number;
  /** How it is running: particles made and drawn, the picture's size, a recent frame's milliseconds. */
  stats(): { particles: number; drawn: number; width: number; height: number; frame: number; density: number; card: string; singers: number };
  /** Stop or restart its own clock. Stopped, it only draws when `advance` or `measure` asks. */
  hold(still: boolean): void;
  /** Draw one frame, `dt` seconds after the last (for a stopped clock). */
  advance(dt: number): void;
  /** Fix the load-shedding step (0 = everything drawn); -1 lets the view choose again. */
  pin(step: number): void;
  /** Settles when every part of the body has been made and handed to the card. */
  ready: Promise<void>;
  /**
   * Recording a video: draw exactly `width` × `height` pixels whatever size the canvas has on the
   * page, with room() and spot() in those pixels. The heads are framed in `room` (left, top, right,
   * bottom insets); the page's own room() calls are kept for when the recording frame goes.
   * `singers`, if given, stand on the stage instead of the page's cast until then. null ends it.
   */
  film(frame: { width: number; height: number; room: readonly number[]; singers?: Singer[] } | null): void;
  /** Called after every frame is drawn, while the picture is still in the canvas to be copied. */
  onDrawn: (() => void) | null;
  /** How the heads and the camera move (the video's motion); null keeps them still. */
  motion(spec: MotionSpec | null): void;
  /**
   * How thick the cloud is: 0 a few motes of light .. 1 every particle made. DENSITY_USUAL is the
   * page's ordinary look. A thin cloud is dimmer and its motes larger; a dense one finer and brighter.
   */
  density(amount: number): void;
  /** 0 cold starlight (the look) .. 1 every part in its own colour, the hue drifting like light through glass. */
  colour(amount: number): void;
  /** Hold every singer's lids at this much closed (0 open .. 1 shut, for pictures); null lets them blink. */
  lids(amount: number | null): void;
  /** Show what the singers wear (decor/): 0 hidden .. 1 shown, as a part of the body is. */
  decorations(amount: number): void;
}
export { DENSITY_USUAL };

/** One singer on the stage: what to call it, its body, and what it wears (nothing, if left out). */
export interface Singer {
  name: string;
  body: Body;
  outfit?: Outfit;
}

const ORDER = LAYERS.map((l) => l.id);
const SKIN = ORDER.indexOf("skin");
const BONE = ORDER.indexOf("bone");
const LUNGS = ORDER.indexOf("lungs");
/** The head to fit until the skin is made, in cm: back of the skull to nose tip, bottom of the neck to the crown, ear to ear. */
const HEAD_BOX = [-10.9, -14.5, -7.6, 11.1, 18.0, 7.6] as const;
/** Where the neck is taken to end for framing: below this the skin fades out anyway. */
const NECK_END = HEAD_BOX[1];
/** How much of the back and the top of the head the frame gives up when the head is cut open, in cm. */
const CUT_CLOSER = [3.5, 5] as const;
/** Half the least height and width, in cm, that a part shown alone is framed with. */
const SOLO_LEAST = 7.5;
/** The most points the framing projects each frame. */
const CLOUD = 1024;
/** In a choir the heads are busts: the frame stops here, where the shader has faded them. */
const BUST_END = -12.5;
/** The point under the chin where a singer's name goes, and the crown above it. */
const UNDER_CHIN = [1.5, -12.5, 0] as const;
const CROWN = [-0.5, 18, 0] as const;
/**
 * Particles each singer gets, as a share of the solo head's, for a cast of n: the heads are
 * smaller on the screen, so fewer particles keep them as dense to the eye, and the whole choir
 * costs the card little more than one head.
 */
const shareFor = (n: number) => (n <= 1 ? 1 : Math.min(1, 1.3 / n));

export function createAnatomyView(canvas: HTMLCanvasElement): AnatomyViewLab {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
  if (!gl) {
    console.warn("Orpheon: this browser has no WebGL2, so the body cannot be drawn.");
    return blank();
  }
  try {
    return build(canvas, gl);
  } catch (error) {
    // A card that refuses the shaders must not take the page down with it.
    console.error("Orpheon: the body cannot be drawn on this graphics card.", error);
    return blank();
  }
}

function build(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): AnatomyViewLab {
  const deep = !!gl.getExtension("EXT_color_buffer_float");
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const card = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));

  // ── the particles: each part arrives when the worker has made it, and fades in ──
  const parts: (Part | null)[] = ORDER.map(() => null);
  const arrays: (WebGLVertexArrayObject | null)[] = ORDER.map(() => null);
  let total = 0;
  let allThere = () => {};
  const ready = new Promise<void>((resolve) => (allThere = resolve));
  /** A part's particles on the card. */
  function upload(part: Part<string>): WebGLVertexArrayObject {
    const array = gl.createVertexArray()!;
    gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, part.floats, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, FLOATS * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, part.bytes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, BYTES, 0);
    gl.bindVertexArray(null);
    return array;
  }
  const stopMaking = makeBodyAside((part) => {
    if (gone) return;
    const i = ORDER.indexOf(part.id);
    const array = upload(part);
    parts[i] = part;
    arrays[i] = array;
    shown[i] = 0;
    total += part.count;
    if (parts.every((p) => p)) allThere();
  });

  // ── what the singers wear: each thing made (in a worker) the first time someone puts it on ──
  const worn = new Map<ItemId, { part: Part<ItemId>; array: WebGLVertexArrayObject }>();
  const wornAside = makeWornAside((part) => {
    if (gone || worn.has(part.id)) return;
    worn.set(part.id, { part, array: upload(part) });
    total += part.count;
  });
  /** Ask for whatever someone on the stage wears that is not made yet. */
  function makeWorn(): void {
    for (const seat of seats) {
      if (!seat.wanted && seat.here < 0.002) continue;
      for (const id of seat.items) if (!worn.has(id)) wornAside.ask(id);
    }
  }

  // ── the programs ──
  const dust = program(gl, DUST_VERTEX, DUST_FRAGMENT);
  const du = uniforms(gl, dust, [
    "u_body", "u_view", "u_lens", "u_eye", "u_pixels", "u_far", "u_time", "u_flicker", "u_tint", "u_shown", "u_edge", "u_apart",
    "u_cut", "u_gain", "u_jaw", "u_lip", "u_lift", "u_fold", "u_air", "u_lung", "u_sound", "u_mouth", "u_nose",
    "u_row", "u_place", "u_turn", "u_lit", "u_bust", "u_bend", "u_colour", "u_grain", "u_eyes", "u_accent", "u_cover",
  ] as const);
  const shrink = program(gl, SCREEN_VERTEX, SHRINK_FRAGMENT);
  const su = uniforms(gl, shrink, ["u_from", "u_step"] as const);
  const blur = program(gl, SCREEN_VERTEX, BLUR_FRAGMENT);
  const bu = uniforms(gl, blur, ["u_from", "u_step"] as const);
  const finish = program(gl, SCREEN_VERTEX, FINISH_FRAGMENT);
  const fu = uniforms(gl, finish, ["u_dust", "u_glow", "u_haze", "u_head", "u_aspect"] as const);
  const empty = gl.createVertexArray()!;

  // ── the body texture and the pictures the frame is built in ──
  const bodyTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, bodyTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, BODY_ROWS * CAST_MAX, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const scene = makeCanvas(gl);
  const glowA = makeCanvas(gl);
  const glowB = makeCanvas(gl);
  const hazeA = makeCanvas(gl);
  const hazeB = makeCanvas(gl);

  // ── what the page has asked for, and where the easing has got to ──
  // The singers: a place on the stage and a body moved by its own telemetry for each. The first
  // is there from the start, alone: the solo head.
  const seats = Array.from({ length: CAST_MAX }, (_, i) => ({ ...makeSeat(), moving: makeMoving(), eyes: new Eyes(i), outfit: BARE as Outfit, items: [] as ItemId[] }));
  /** Lids held for a picture, or null. */
  let lidsHeld: number | null = null;
  // The heads' own movement and the camera's (still, unless the video asks).
  const motion = new Motion();
  const motionIn: HeadInput[] = Array.from({ length: CAST_MAX }, () => ({ here: false, x: 0, level: 0, f0: 0 }));
  const leadAt = new Float32Array(3);
  const leadSum = new Float32Array(3);
  /** Where the singing heads are (stage cm), when the camera looks toward them; and the framing's own slide, kept apart from the camera's. */
  const focusAt = new Float32Array(3);
  let camFocus = false;
  let frameShiftX = 0, frameShiftY = 0, camShiftX = 0, camShiftY = 0;
  /** The most the camera may zoom and still keep its shot (heads and names) inside the frame: measured each frame, eased. */
  let camZoomCap = 4;
  /** Points of a head that must stay in the frame: the crown, the face, the back of the skull, and below the chin where its name is written. */
  const KEEP = [[-0.5, 19, 0], [13, 3, 0], [-11, 5, 0], [1.5, -22, 0]] as const;
  seats[0].wanted = true;
  seats[0].here = 1;
  let castCount = 1;
  /** 0 a solo head .. 1 a choir, eased. */
  let choir = 0;
  /** The singer the pointer is over, whose parts it finds and names. */
  let focused = 0;
  /** Each singer's head on the canvas this frame, in picture pixels: under the chin x, y, then the crown's y. */
  const spots = new Float32Array(CAST_MAX * 3);
  const local = new Float32Array(CLOUD * 3);
  const scratch = new Float32Array(3);
  const eye = makeEye();
  const pace = makePace();
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const wanted = { amount: ORDER.map(() => 1), solo: -1, explode: 0, cut: 0, yaw: 0, pitch: 0, zoom: 1, room: [0, 0, 0, 0], dressed: 1 };
  const shown = ORDER.map(() => 0);
  /** How much the decorations show, eased (they show and ghost with the skin). */
  let dressed = 0;
  const head = new Float32Array(3);
  const spot = new Float32Array(3);
  // What the framing fits this frame: points of the scene.
  const cloud = new Float32Array(CLOUD * 3);
  let cloudCount = 0;
  let localCount = 0;
  let spread = 1;
  /** Each singer's share of the solo head's particles, eased. */
  let share = 1;
  let framed = false;
  let explode = 0;
  let cut = 0;
  /** The page's density and colour, as asked and as eased toward. */
  const look = { density: DENSITY_USUAL, colour: 0, wantDensity: DENSITY_USUAL, wantColour: 0 };
  let fit = 1;
  let drift = 0;
  let last = 0;
  let timer = 0;
  let still = false;
  let gone = false;
  let drawn = 0;
  let strain = 1;
  /** While a video is recorded: the picture's fixed size. */
  let fixed: { width: number; height: number } | null = null;
  /** What the page asked for, kept while a recording frame stands in for it. */
  const pageRoom = [0, 0, 0, 0];
  let pageCast: Singer[] = [];
  let filmCast = false;
  /** The canvas's size in the units room() and spot() use: CSS pixels, or the recording's pixels. */
  const wideOf = () => (fixed ? fixed.width : Math.max(1, canvas.clientWidth));
  const tallOf = () => (fixed ? fixed.height : Math.max(1, canvas.clientHeight));

  const pointer = makePointer(canvas, {
    eye, parts,
    moving: () => seats[focused].moving,
    place: (at) => placePoint(seats[focused].now, at[0], at[1], at[2], at),
    focus(x, y) {
      // The head nearest the pointer, measured to the middle of its face.
      let best = Infinity;
      for (let i = 0; i < CAST_MAX; i++) {
        if (!seats[i].wanted || seats[i].here < 0.5) continue;
        const d = Math.hypot(spots[i * 3] - x, (spots[i * 3 + 1] + spots[i * 3 + 2]) / 2 - y);
        if (d < best) {
          best = d;
          focused = i;
        }
      }
      return focused;
    },
    grabbable: () => castCount === 1,
    shows: (i) => wanted.amount[i] > 0.3 && (wanted.solo < 0 || wanted.solo === i),
    apartOf: (i, out) => {
      const a = STYLE[ORDER[i]].apart;
      out[0] = a[0] * explode;
      out[1] = a[1] * explode;
      out[2] = a[2] * explode;
    },
    cut: () => cut,
    calm: () => calm.matches,
    hover: (i) => {
      view.onSinger?.(i < 0 || castCount < 2 ? -1 : focused);
      view.onHover?.(i < 0 ? null : ORDER[i]);
    },
    grab: (pose) => view.onGrab?.(pose),
    wake,
  });

  function resize(): void {
    // The picture is as sharp as the screen up to a budget of pixels; past that (a high-density
    // screen on a modest card) it is drawn smaller and stretched.
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt((pace.pixels * 1_500_000) / (w * h)));
    // A recording is drawn at its own size, every pixel of it.
    const width = fixed ? fixed.width : Math.max(1, Math.round(w * ratio));
    const height = fixed ? fixed.height : Math.max(1, Math.round(h * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    sizeCanvas(gl!, scene, width, height, deep);
    const qw = Math.max(1, width >> 2);
    const qh = Math.max(1, height >> 2);
    sizeCanvas(gl!, glowA, qw, qh, deep);
    sizeCanvas(gl!, glowB, qw, qh, deep);
    sizeCanvas(gl!, hazeA, Math.max(1, qw >> 2), Math.max(1, qh >> 2), deep);
    sizeCanvas(gl!, hazeB, Math.max(1, qw >> 2), Math.max(1, qh >> 2), deep);
  }

  /** Move everything that eases one step closer to what was asked. */
  function settle(dt: number): void {
    const instant = calm.matches;
    const toward = (seconds: number) => (instant ? 1 : 1 - Math.exp(-dt / seconds));
    for (let i = 0; i < ORDER.length; i++) {
      const goal = wanted.amount[i] * (wanted.solo < 0 || wanted.solo === i ? 1 : 0.04);
      shown[i] += (goal - shown[i]) * toward(0.22);
    }
    explode += (wanted.explode - explode) * toward(0.45);
    dressed += (wanted.dressed * (wanted.solo < 0 || wanted.solo === SKIN ? 1 : 0.04) - dressed) * toward(0.22);
    look.density += (look.wantDensity - look.density) * toward(0.25);
    look.colour += (look.wantColour - look.colour) * toward(0.3);
    cut += (wanted.cut - cut) * toward(0.4);
    pointer.settle(dt, instant);

    // Where to look: the head, or the one part shown alone, or the whole spread when taken apart.
    // The eye circles that point; how big it is drawn and where it sits is the framing's job.
    let x = -0.3;
    let y = 2.0;
    // In a choir the heads are busts: the frame stops where they fade.
    const neckEnd = NECK_END + (BUST_END - NECK_END) * choir * (1 - explode);
    const alone = wanted.solo >= 0 && wanted.solo !== SKIN && wanted.solo !== BONE ? wanted.solo : -1;
    localCount = 0;
    if (alone >= 0) {
      const s = STYLE[ORDER[alone]];
      // A small part is not blown up past the size of the mouth: it is seen in its place.
      const r = Math.max(0.75 * s.reach, SOLO_LEAST);
      x = s.middle[0];
      y = s.middle[1];
      corners(x - r, y - r, -0.4 * r, x + r, y + r, 0.4 * r);
    } else {
      // Cut open, the empty top and back of the skull give way to the airway: the frame closes in
      // on the mouth, the nose and the throat, which are what the section is for.
      const top = HEAD_BOX[4] - CUT_CLOSER[1] * cut;
      const back = HEAD_BOX[0] + CUT_CLOSER[0] * cut;
      // What the singers wear first (a top hat must not be cut off), then the head itself.
      if (wanted.dressed > 0.5 && wanted.solo < 0) {
        const seen = new Set<ItemId>();
        for (const seat of seats) if (seat.wanted) for (const id of seat.items) seen.add(id);
        for (const id of seen) {
          const m = worn.get(id)?.part.marks;
          if (!m) continue;
          const every = 3 * Math.max(1, Math.floor(m.length / 3 / 24));
          for (let k = 0; k < m.length; k += every) put(Math.max(back, m[k]), m[k + 1], m[k + 2]);
        }
      }
      const marks = parts[SKIN]?.marks;
      if (marks) {
        for (let k = 0; k < marks.length; k += 3) {
          if (marks[k + 1] >= neckEnd) put(Math.max(back, marks[k]), Math.min(top, marks[k + 1]), marks[k + 2]);
        }
      } else corners(back, HEAD_BOX[1], HEAD_BOX[2], HEAD_BOX[3], top, HEAD_BOX[5]);
    }
    if (explode > 0.001) {
      // Fit everything that is shown, where the explode has carried it.
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < ORDER.length; i++) {
        if (wanted.amount[i] < 0.3 || (wanted.solo >= 0 && wanted.solo !== i)) continue;
        const s = STYLE[ORDER[i]];
        const reach = Math.min(s.reach, 16);
        x0 = Math.min(x0, s.middle[0] + s.apart[0] - reach * 0.7);
        x1 = Math.max(x1, s.middle[0] + s.apart[0] + reach * 0.7);
        y0 = Math.min(y0, s.middle[1] + s.apart[1] - reach);
        y1 = Math.max(y1, s.middle[1] + s.apart[1] + reach);
      }
      if (x1 > x0) {
        x += ((x0 + x1) / 2 - x) * explode;
        y += ((y0 + y1) / 2 - y) * explode;
        // What is fitted grows from the head's box to the spread's as the parts drift apart.
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, c0 = Infinity, c1 = -Infinity;
        for (let k = 0; k < localCount * 3; k += 3) {
          a0 = Math.min(a0, local[k]);
          a1 = Math.max(a1, local[k]);
          b0 = Math.min(b0, local[k + 1]);
          b1 = Math.max(b1, local[k + 1]);
          c0 = Math.min(c0, local[k + 2]);
          c1 = Math.max(c1, local[k + 2]);
        }
        const e = explode;
        localCount = 0;
        corners(a0 + (x0 - a0) * e, b0 + (y0 - b0) * e, c0 + (-6 - c0) * e, a1 + (x1 - a1) * e, b1 + (y1 - b1) * e, c1 + (6 - c1) * e);
      }
    }
    stage(x, y, dt, instant);
    if (!instant) drift += dt;
  }

  /**
   * The singers: each one's place on the stage, its coming and going, how lit it is; then what
   * the framing fits (every singer's head, each where it stands) and where the eye looks.
   * (x, y) is where it would look on a head of its own.
   */
  function stage(x: number, y: number, dt: number, instant: boolean): void {
    choir += ((castCount > 1 ? 1 : 0) - choir) * (instant ? 1 : 1 - Math.exp(-dt / 0.5));
    // The choir is laid out for the shape of the room the page leaves it.
    const r = wanted.room;
    const W = wideOf();
    const H = tallOf();
    const aspect = Math.max(W - r[0] - r[2], W / 3) / Math.max(H - r[1] - r[3], H / 3);
    const bodies: Body[] = [];
    const who: number[] = [];
    seats.forEach((seat, i) => {
      if (!seat.wanted) return;
      bodies.push(seat.body);
      who.push(i);
    });
    const places = arrange(bodies, aspect, explode);
    who.forEach((i, k) => Object.assign(seats[i].goal, places[k]));
    for (const seat of seats) if (seat.wanted || seat.here > 0.002) settleSeat(seat, seat.moving, dt, instant);

    // Every singer's head, where it stands now. A long list of points is thinned to fit.
    cloudCount = 0;
    const stride = Math.max(1, Math.ceil((localCount * who.length) / CLOUD));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const i of who) {
      for (let k = 0; k < localCount && cloudCount < CLOUD; k += stride) {
        const at = cloudCount * 3;
        placePoint(seats[i].now, local[k * 3], local[k * 3 + 1], local[k * 3 + 2], cloud, at);
        x0 = Math.min(x0, cloud[at]);
        x1 = Math.max(x1, cloud[at]);
        y0 = Math.min(y0, cloud[at + 1]);
        y1 = Math.max(y1, cloud[at + 1]);
        z0 = Math.min(z0, cloud[at + 2]);
        z1 = Math.max(z1, cloud[at + 2]);
        cloudCount++;
      }
    }
    // One singer: the eye looks where it would at that head. A choir: at the middle of it.
    if (who.length === 1) placePoint(seats[who[0]].now, x, y, 0, scratch);
    else {
      scratch[0] = (x0 + x1) / 2;
      scratch[1] = (y0 + y1) / 2;
      scratch[2] = (z0 + z1) / 2;
    }
    // The camera may look toward the heads singing now (the video's follow and close-ups).
    if (motion.camera.toward > 0.001 && who.length > 1) {
      let weight = 0;
      leadSum.fill(0);
      for (const i of who) {
        const w = motion.camera.focus[i] ?? 0;
        if (w <= 0) continue;
        placePoint(seats[i].now, 2, 3, 0, leadAt);
        for (let c = 0; c < 3; c++) leadSum[c] += leadAt[c] * w;
        weight += w;
      }
      camFocus = weight > 1e-6;
      if (camFocus) for (let c = 0; c < 3; c++) focusAt[c] = leadSum[c] / weight;
    } else camFocus = false;
    const k = instant ? 1 : 1 - Math.exp(-dt / 0.5);
    for (let c = 0; c < 3; c++) eye.at[c] += (scratch[c] - eye.at[c]) * k;
    // The faint lift behind the head grows to lie behind the whole choir.
    spread = 1 + (Math.max(1, (x1 - x0) / 24, (y1 - y0) / 34) - 1) * choir;
  }

  function put(x: number, y: number, z: number): void {
    if (localCount >= CLOUD) return;
    local[localCount * 3] = x;
    local[localCount * 3 + 1] = y;
    local[localCount * 3 + 2] = z;
    localCount++;
  }
  function corners(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let c = 0; c < 8; c++) put(c & 1 ? x1 : x0, c & 2 ? y1 : y0, c & 4 ? z1 : z0);
  }

  /** Point the eye for this frame, and frame what it sees. */
  function aim(dt: number): void {
    const instant = calm.matches || !framed;
    const scale = canvas.width / wideOf();
    eye.yaw = pointer.yaw + motion.camera.yaw;
    eye.pitch = pointer.pitch + motion.camera.pitch;
    // The framing slides the eye to centre the whole cast; the camera's own slide rides on top.
    eye.shiftX = frameShiftX;
    eye.shiftY = frameShiftY;
    // The first frame, or with reduced motion, lands at once: a few rounds of measuring settle it.
    for (let round = 0; round < (instant ? 4 : 1); round++) {
      eye.zoom = fit;
      see(eye, canvas.width, canvas.height);
      fit = frameStep(eye, cloud, cloudCount, wanted.room, scale, fit, instant ? 1 : 1 - Math.exp(-dt / 0.45), spot);
    }
    frameShiftX = eye.shiftX;
    frameShiftY = eye.shiftY;
    const camZoom = Math.max(1, Math.min(motion.camera.zoom, camZoomCap));
    eye.zoom = pointer.zoom * fit * camZoom;
    eye.shiftX = frameShiftX + camShiftX;
    eye.shiftY = frameShiftY + camShiftY;
    see(eye, canvas.width, canvas.height);
    // The camera's slide: a share (`toward`) of the way to the singing heads in the room's middle,
    // and only as far as the shot has closed in (a wide shot slid sideways is a badly framed one).
    const ease = instant ? 1 : 1 - Math.exp(-dt / 1.2);
    let wantX = 0, wantY = 0;
    if (camFocus && motion.camera.toward > 0.001) {
      land(eye, focusAt[0], focusAt[1], focusAt[2], spot);
      const r = wanted.room;
      const W = eye.width, H = eye.height;
      const left = r[0] * scale, top = r[1] * scale, right = r[2] * scale, bottom = r[3] * scale;
      const cx = left + Math.max(W / 3, W - left - right) / 2;
      const cy = top + Math.max(H / 3, H - top - bottom) / 2;
      if (spot[2] > 0) {
        const closed = Math.max(0, Math.min(1, (camZoom - 1) / 0.2));
        wantX = closed * motion.camera.toward * (camShiftX + ((cx - spot[0]) * 2) / W);
        wantY = closed * motion.camera.toward * (camShiftY - ((cy - spot[1]) * 2) / H);
      }
    }
    camShiftX += (wantX - camShiftX) * ease;
    camShiftY += (wantY - camShiftY) * ease;
    eye.shiftX = frameShiftX + camShiftX;
    eye.shiftY = frameShiftY + camShiftY;
    see(eye, canvas.width, canvas.height);
    // Keep the shot inside the frame: the heads it shows (the singing ones in a close shot, all of
    // them in a wide one), crown to the name under the chin, with a margin. A shot that would cut
    // one off is held back to the zoom that fits.
    if (motion.moving) {
      const r = wanted.room;
      const W = eye.width, H = eye.height;
      const left = r[0] * scale, top = r[1] * scale;
      const fw = Math.max(W / 3, W - left - r[2] * scale), fh = Math.max(H / 3, H - top - r[3] * scale);
      const margin = 0.05 * Math.min(fw, fh);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const close = motion.camera.toward > 0.2;
      for (let i = 0; i < CAST_MAX; i++) {
        const seat = seats[i];
        if (!seat.wanted || seat.here < 0.5) continue;
        // (a voice the shot is turning to counts at once: its head must not be cut on the way in)
        if (close && castCount > 1 && (motion.camera.focus[i] ?? 0) < 0.04) continue;
        for (const p of KEEP) {
          placePoint(seat.now, p[0], p[1], p[2], scratch);
          land(eye, scratch[0], scratch[1], scratch[2], spot);
          if (spot[2] <= 0) continue;
          x0 = Math.min(x0, spot[0]);
          x1 = Math.max(x1, spot[0]);
          y0 = Math.min(y0, spot[1]);
          y1 = Math.max(y1, spot[1]);
        }
      }
      if (x1 > x0 && y1 > y0) {
        // how much bigger (or smaller) the shot could be and still fit, about its middle
        const cx = left + fw / 2, cy = top + fh / 2;
        const room = Math.min((fw / 2 - margin) / Math.max(cx - x0, x1 - cx, 1), (fh / 2 - margin) / Math.max(cy - y0, y1 - cy, 1));
        const goal = Math.max(1, Math.min(4, camZoom * room));
        // tighten fast (nothing may be cut off for long), loosen slowly
        camZoomCap += (goal - camZoomCap) * (instant ? 1 : 1 - Math.exp(-dt / (goal < camZoomCap ? 0.25 : 1.5)));
      }
    } else camZoomCap = 4;
    framed = true;
    // Where each singer's head landed, for the page to write its name under it.
    for (let i = 0; i < CAST_MAX; i++) {
      const place = seats[i].now;
      placePoint(place, UNDER_CHIN[0], UNDER_CHIN[1], UNDER_CHIN[2], scratch);
      land(eye, scratch[0], scratch[1], scratch[2], spot);
      spots[i * 3] = spot[0];
      spots[i * 3 + 1] = spot[1];
      placePoint(place, CROWN[0], CROWN[1], CROWN[2], scratch);
      land(eye, scratch[0], scratch[1], scratch[2], spot);
      spots[i * 3 + 2] = spot[1];
    }
  }

  function pass(to: WebGLFramebuffer | null, width: number, height: number): void {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, to);
    gl!.viewport(0, 0, width, height);
  }

  function soften(from: WebGLTexture, fromWidth: number, fromHeight: number, a: typeof glowA, b: typeof glowA): void {
    gl!.useProgram(shrink);
    pass(a.frame, a.width, a.height);
    gl!.bindTexture(gl!.TEXTURE_2D, from);
    gl!.uniform1i(su.u_from, 0);
    gl!.uniform2f(su.u_step, 1 / fromWidth, 1 / fromHeight);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.useProgram(blur);
    gl!.uniform1i(bu.u_from, 0);
    pass(b.frame, b.width, b.height);
    gl!.bindTexture(gl!.TEXTURE_2D, a.texture);
    gl!.uniform2f(bu.u_step, 1 / a.width, 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    pass(a.frame, a.width, a.height);
    gl!.bindTexture(gl!.TEXTURE_2D, b.texture);
    gl!.uniform2f(bu.u_step, 0, 1 / a.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function draw(dt: number): void {
    resize();
    for (let i = 0; i < CAST_MAX; i++) {
      const seat = seats[i];
      const m = motionIn[i];
      m.here = seat.wanted && seat.here > 0.5;
      m.x = seat.now.x;
      m.level = seat.moving.now[TELEMETRY.level] || 0;
      m.f0 = seat.moving.now[TELEMETRY.f0] || 0;
    }
    motion.step(calm.matches ? 0 : dt, motionIn);
    settle(dt);
    for (const seat of seats) if (seat.wanted || seat.here > 0.002) seat.moving.step(dt);
    aim(dt);

    // The dust, added light on light: every part of every singer.
    pass(scene.frame, scene.width, scene.height);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.useProgram(dust);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, bodyTexture);
    gl!.uniform1i(du.u_body, 0);
    gl!.uniformMatrix4fv(du.u_view, false, eye.view);
    gl!.uniformMatrix4fv(du.u_lens, false, eye.lens);
    gl!.uniform3fv(du.u_eye, eye.place);
    gl!.uniform1f(du.u_pixels, eye.pixels);
    gl!.uniform1f(du.u_far, eye.far);
    gl!.uniform1f(du.u_time, drift);
    gl!.uniform1f(du.u_cut, cut);
    // A choir's singers are busts, unless the lungs are what is being looked at.
    gl!.uniform1f(du.u_bust, choir * (1 - explode) * (wanted.solo === LUNGS ? 0 : 1));
    // The dust thins (or thickens) as the cast changes, with the heads, not at once.
    share += (shareFor(castCount) - share) * (calm.matches ? 1 : 1 - Math.exp(-dt / 0.5));
    drawn = 0;
    // The share of what was made that is drawn, and how bright each mote must be for the cloud to
    // keep its brightness: fully made up for the machine's load shedding and a choir's sharing,
    // only partly for the page's own density, so a thin cloud is also a fainter one.
    const asked = look.density;
    const brighter = Math.pow(asked / DENSITY_USUAL, 0.6);
    gl!.uniform1f(du.u_colour, look.colour);
    gl!.uniform1f(du.u_grain, Math.min(1.3, Math.max(0.85, Math.pow(DENSITY_USUAL / Math.max(0.05, asked), 0.2))));
    for (let h = 0; h < CAST_MAX; h++) {
      const seat = seats[h];
      if (seat.here < 0.003) continue;
      const moving = seat.moving;
      gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, h * BODY_ROWS, N, BODY_ROWS, gl!.RGBA, gl!.FLOAT, moving.body);
      gl!.uniform1f(du.u_row, h * BODY_ROWS);
      gl!.uniform4f(du.u_place, seat.now.x, seat.now.y, seat.now.z, seat.now.scale);
      const pose = motion.heads[h];
      const turn = seat.now.turn + (pose?.turn ?? 0);
      gl!.uniform2f(du.u_turn, Math.cos(turn), Math.sin(turn));
      gl!.uniform2f(du.u_bend, pose?.nod ?? 0, pose?.tilt ?? 0);
      // Alone, the head is always fully lit; in a choir a silent singer rests dim.
      gl!.uniform1f(du.u_lit, seat.here * (1 + (RESTING + (1 - RESTING) * seat.lit - 1) * choir));
      gl!.uniform1f(du.u_flicker, moving.sparks);
      gl!.uniform4f(du.u_jaw, moving.jawCos, moving.jawSin, JAW_PIVOT[0], JAW_PIVOT[1]);
      gl!.uniform4f(du.u_lip, moving.lipDrop, moving.lipWidth, moving.lipReach, 0);
      gl!.uniform1f(du.u_lift, moving.lift);
      gl!.uniform4f(du.u_fold, moving.strobe, moving.voiced, moving.foldsApart, 0);
      gl!.uniform4f(du.u_air, moving.airTravel, moving.held, moving.heldAt, moving.noseTravel);
      gl!.uniform4f(du.u_lung, moving.lungSize, moving.lungPressure, moving.lungTravel, 0);
      gl!.uniform4f(du.u_sound, moving.ripple, moving.ripplesPerCm, moving.voiced, moving.hiss);
      gl!.uniform4f(du.u_mouth, moving.mouthX, moving.mouthY, moving.mouthHalf, moving.mouthShare);
      gl!.uniform1f(du.u_nose, moving.noseOpen);
      const eyes = seat.eyes;
      eyes.step(dt, calm.matches);
      const shaded = dressed > 0.003 && seat.outfit.eyes === "shades" && worn.has("shades") ? SHADE * Math.min(1, dressed) : 0;
      gl!.uniform4f(du.u_eyes, lidsHeld ?? eyes.closed, eyes.turn, eyes.raise, shaded);
      // The skin under this singer's hat, if it wears one that covers it.
      const cover = dressed > 0.003 ? coverOf(seat.outfit.head) : null;
      const covering = cover && worn.has(seat.outfit.head!) ? cover[3] * Math.min(1, dressed) : 0;
      for (let again = 0; again < strain; again++)
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part || shown[i] < 0.003) continue;
        gl!.uniform4f(du.u_cover, cover?.[0] ?? 0, cover?.[1] ?? 1, cover?.[2] ?? 0, i === SKIN ? covering : i === BONE ? covering * 0.6 : 0);
        const style = STYLE[part.id];
        const density = pace.density * share * asked;
        const count = Math.max(1, Math.floor(part.count * density));
        const c = look.colour;
        gl!.uniform3f(du.u_tint, style.tint[0] + (style.vivid[0] - style.tint[0]) * c, style.tint[1] + (style.vivid[1] - style.tint[1]) * c, style.tint[2] + (style.vivid[2] - style.tint[2]) * c);
        gl!.uniform1f(du.u_shown, shown[i]);
        gl!.uniform1f(du.u_edge, style.edge);
        gl!.uniform1f(du.u_gain, (style.gain * brighter) / (density * BUILT));
        gl!.uniform3f(du.u_apart, style.apart[0] * explode, style.apart[1] * explode, style.apart[2] * explode);
        gl!.bindVertexArray(arrays[i]);
        gl!.drawArrays(gl!.POINTS, 0, count);
        if (again === 0) drawn += count;
      }
      if (dressed > 0.003) drawn += dress(seat.items, asked, brighter, strain);
    }
    gl!.disable(gl!.BLEND);

    // Its glow: the same picture, small and blurred, twice over.
    gl!.bindVertexArray(empty);
    soften(scene.texture, scene.width, scene.height, glowA, glowB);
    soften(glowA.texture, glowA.width, glowA.height, hazeA, hazeB);

    // And the finished frame.
    pass(null, canvas.width, canvas.height);
    gl!.useProgram(finish);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, glowA.texture);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, hazeA.texture);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, scene.texture);
    gl!.uniform1i(fu.u_dust, 0);
    gl!.uniform1i(fu.u_glow, 1);
    gl!.uniform1i(fu.u_haze, 2);
    // Behind the head, or behind the middle of the choir and as wide as it.
    placePoint(seats[0].now, -0.5 + STYLE.skin.apart[0] * explode, 3, 0, scratch);
    for (let c = 0; c < 3; c++) scratch[c] += (eye.at[c] - scratch[c]) * choir;
    land(eye, scratch[0], scratch[1], scratch[2], head);
    gl!.uniform3f(fu.u_head, head[0] / canvas.width, 1 - head[1] / canvas.height, (spread * 0.42 * eye.zoom * 42) / Math.max(42, (28 * canvas.height) / canvas.width));
    gl!.uniform1f(fu.u_aspect, canvas.width / canvas.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    view.onDrawn?.();
  }

  /**
   * Draw what one singer wears, after its body, with that singer's uniforms already set. Small
   * things (a stud, a bindi) are drawn whole however thin the cloud, so they never vanish. Returns
   * how many particles were drawn.
   */
  function dress(items: readonly ItemId[], asked: number, brighter: number, times: number): number {
    let count = 0;
    gl!.uniform4f(du.u_cover, 0, 1, 0, 0);
    const style = STYLE.skin;
    gl!.uniform1f(du.u_shown, dressed);
    gl!.uniform3f(du.u_apart, style.apart[0] * explode, style.apart[1] * explode, style.apart[2] * explode);
    const c = look.colour;
    for (const id of items) {
      const it = worn.get(id);
      if (!it) continue;
      const s = ITEM_STYLE[id];
      const made = it.part.count;
      const n = Math.min(made, Math.max(300, Math.floor(made * pace.density * share * asked)));
      gl!.uniform3f(du.u_tint, s.tint[0] + (s.vivid[0] - s.tint[0]) * c, s.tint[1] + (s.vivid[1] - s.tint[1]) * c, s.tint[2] + (s.vivid[2] - s.tint[2]) * c);
      gl!.uniform3f(du.u_accent, s.accent[0] + (s.vividAccent[0] - s.accent[0]) * c, s.accent[1] + (s.vividAccent[1] - s.accent[1]) * c, s.accent[2] + (s.vividAccent[2] - s.accent[2]) * c);
      gl!.uniform1f(du.u_edge, s.edge);
      gl!.uniform1f(du.u_gain, (s.gain * brighter) / ((n / made) * BUILT));
      gl!.bindVertexArray(it.array);
      for (let again = 0; again < times; again++) gl!.drawArrays(gl!.POINTS, 0, n);
      count += n;
    }
    return count;
  }

  function tick(ms: number): void {
    timer = 0;
    if (gone) return;
    const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
    last = ms;
    if (dt > 0) pace.saw(dt * 1000);
    makeWorn();
    draw(dt);
    if (!still) timer = requestAnimationFrame(tick);
  }
  /** Put these singers on the stage: the places they ask for are wanted, the rest are let go. */
  function seat(singers: Singer[]): void {
    const n = Math.max(1, Math.min(CAST_MAX, singers.length));
    seats.forEach((place, i) => {
      place.wanted = i < n;
      if (i < singers.length) {
        place.name = singers[i].name;
        place.body = { tract: singers[i].body.tract, folds: singers[i].body.folds };
      }
      // What it wears comes with it (a place no one stands in keeps its clothes as it fades out).
      if (i < n) {
        place.outfit = singers[i]?.outfit ?? BARE;
        place.items = itemsOf(place.outfit);
      }
    });
    castCount = n;
    if (focused >= n) focused = 0;
    makeWorn();
    wake();
  }

  /** Something changed. The clock is always running unless the lab has stopped it, so there is nothing to do. */
  function wake(): void {}
  const lost = (e: Event) => e.preventDefault();
  canvas.addEventListener("webglcontextlost", lost);

  const view: AnatomyViewLab = {
    frame(telemetry) {
      seats[0].moving.take(telemetry);
      wake();
    },
    frameOf(index: number, telemetry: Float32Array) {
      seats[index]?.moving.take(telemetry);
    },
    cast(singers: Singer[]) {
      pageCast = singers.map((s) => ({ name: s.name, body: { tract: s.body.tract, folds: s.body.folds }, outfit: s.outfit }));
      if (!filmCast) seat(singers);
    },
    motion(spec) {
      motion.set(spec);
    },
    density(amount: number) {
      look.wantDensity = Math.min(1, Math.max(0.05, amount));
    },
    colour(amount: number) {
      look.wantColour = Math.min(1, Math.max(0, amount));
    },
    lids(amount: number | null) {
      lidsHeld = amount === null ? null : Math.min(1, Math.max(0, amount));
    },
    decorations(amount: number) {
      wanted.dressed = Math.min(1, Math.max(0, amount));
    },
    film(frame) {
      fixed = frame ? { width: Math.max(1, Math.round(frame.width)), height: Math.max(1, Math.round(frame.height)) } : null;
      const r = wanted.room;
      for (let i = 0; i < 4; i++) r[i] = Math.max(0, (frame ? frame.room[i] : pageRoom[i]) || 0);
      if (frame?.singers) {
        filmCast = true;
        seat(frame.singers);
      } else if (filmCast) {
        filmCast = false;
        seat(pageCast);
      }
      wake();
    },
    onDrawn: null as (() => void) | null,
    spot(index: number) {
      const seat = seats[index];
      if (!seat?.wanted) return null;
      const k = Math.max(1, canvas.width) / wideOf();
      return { x: spots[index * 3] / k, y: spots[index * 3 + 1] / k, size: (spots[index * 3 + 1] - spots[index * 3 + 2]) / k };
    },
    onSinger: null as ((index: number) => void) | null,
    layer(id: LayerId, amount: number) {
      wanted.amount[ORDER.indexOf(id)] = Math.min(1, Math.max(0, amount));
      wake();
    },
    solo(id: LayerId | null) {
      wanted.solo = id === null ? -1 : ORDER.indexOf(id);
      wake();
    },
    explode(amount: number) {
      wanted.explode = Math.min(1, Math.max(0, amount));
      wake();
    },
    cut(amount: number) {
      wanted.cut = Math.min(1, Math.max(0, amount));
      wake();
    },
    look(yaw: number, pitch: number, zoom: number) {
      pointer.look(yaw, pitch, zoom);
      wake();
    },
    room(left: number, top: number, right: number, bottom: number) {
      const r = pageRoom;
      r[0] = Math.max(0, left || 0);
      r[1] = Math.max(0, top || 0);
      r[2] = Math.max(0, right || 0);
      r[3] = Math.max(0, bottom || 0);
      if (!fixed) wanted.room.splice(0, 4, ...r);
      wake();
    },
    onGrab: null as ((pose: Partial<Pose>) => void) | null,
    onHover: null as ((id: LayerId | null) => void) | null,
    dispose() {
      gone = true;
      stopMaking();
      wornAside.stop();
      cancelAnimationFrame(timer);
      pointer.dispose();
      canvas.removeEventListener("webglcontextlost", lost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
    measure(frames: number, times = 1) {
      const pixel = new Uint8Array(4);
      strain = times;
      makeWorn();
      draw(0);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const start = performance.now();
      for (let i = 0; i < frames; i++) {
        draw(1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      strain = 1;
      return (performance.now() - start) / frames;
    },
    stats: () => ({ particles: total, drawn, width: canvas.width, height: canvas.height, frame: pace.frame, density: pace.density, card, singers: castCount }),
    ready,
    advance(dt: number) {
      makeWorn();
      draw(dt);
    },
    pin(step: number) {
      pace.pin(step);
    },
    hold(yes: boolean) {
      still = yes;
      if (!yes && !timer && !gone) {
        last = 0;
        timer = requestAnimationFrame(tick);
      }
    },
  };
  timer = requestAnimationFrame(tick);
  return view;
}

/** A view that draws nothing, for a browser that cannot. */
function blank(): AnatomyViewLab {
  return {
    frame() {}, layer() {}, solo() {}, explode() {}, cut() {}, look() {}, room() {}, onGrab: null, onHover: null, dispose() {},
    cast() {}, frameOf() {}, spot: () => null, onSinger: null, film() {}, onDrawn: null, motion() {}, density() {}, colour() {}, lids() {}, decorations() {},
    measure: () => 0,
    advance() {},
    pin() {},
    ready: Promise.resolve(),
    stats: () => ({ particles: 0, drawn: 0, width: 0, height: 0, frame: 0, density: 0, card: "none", singers: 0 }),
    hold() {},
  };
}
