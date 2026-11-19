// Video: the stage inside a frame of a chosen shape, drawn as the video will be (the heads, each
// singer's name, the caption, the title, the instruments), and recorded two ways:
//
//   live   what is on the screen as it plays, with the sound as heard (MediaRecorder);
//   fast   the last performance rendered offline faster than real time, then every frame drawn
//          from the telemetry recorded at that frame, with a fixed step, and encoded (WebCodecs).
//
// The page gives it the top bar's corner for its entry and its buttons; the frame takes the
// space the page's controls leave, letterboxed, its corners marked.
import "./film.css";
import { INSTRUMENT_TELEMETRY_SIZE, TELEMETRY_SIZE } from "../../contract.ts";
import type { AnatomyViewLab } from "../../view/index.ts";
import type { App } from "../app.ts";
import { save } from "../audio/export.ts";
import { sizedBody } from "../bodies.ts";
import { clock } from "../caption.ts";
import { el } from "../dom.ts";
import { jobFor } from "../save.ts";
import { songById } from "../songs.ts";
import { lengthOf } from "../state.ts";
import type { Performance, State } from "../state.ts";
import { action, choice, section, toggle } from "../ui/controls.ts";
import { castOf } from "../ui/stage.ts";
import type { Stage } from "../ui/stage.ts";
import { bitrateFor, encode, plan } from "./encode.ts";
import type { Quality } from "./encode.ts";
import { LOOKS, SHAPES, layout, letterbox, lookById, shapeById, videoName } from "./frames.ts";
import type { Box, Layout, LookId, Shape, ShapeId } from "./frames.ts";
import { renderFilm } from "./job.ts";
import type { FilmJob, Rendered } from "./job.ts";
import { recordLive } from "./live.ts";
import type { Take } from "./live.ts";
import { Cue, drawFrame, titled } from "./overlay.ts";
import type { Moment, Singer } from "./overlay.ts";
import { Timeline } from "./timeline.ts";
import { MOTIONS, randomMotion } from "../../view/motion.ts";
import { planFor } from "./direct.ts";
import type { MotionSpec } from "../../view/motion.ts";

/** Seconds of quiet before a fast recording's performance starts, and after it ends (the room's tail). */
const LEAD = 0.5;
const TAIL = 1.2;
/** Frames drawn before a fast recording starts, so the heads have arrived and are framed. */
const SETTLE = 45;

export interface Film {
  /** For the top bar: the Video entry and, while filming, the frame's own buttons. */
  entry: HTMLElement;
  /** The frame on the page, its corner marks, and the chooser. */
  root: HTMLElement;
}

interface Settings {
  shape: ShapeId;
  fps: 30 | 60;
  quality: Quality;
  captions: boolean;
  /** What the video shows besides the heads: the timeline, the band large, or the heads alone. */
  look: LookId;
  /** How the heads and the camera move: one of MOTIONS, or "random" (made up from `seed`). */
  motion: string;
  seed: number;
}

/** What a recording is doing. */
type Busy = { kind: "fast"; done: number; cancelled: boolean } | { kind: "live"; take: Take; auto: boolean } | null;

/** The view's recording side, when the stage could draw at all. */
type Lab = Pick<AnatomyViewLab, "film" | "onDrawn" | "hold" | "advance" | "pin" | "spot" | "frameOf" | "motion" | "direct">;
const labOf = (view: Stage["view"]): Lab | null => {
  const v = view as Partial<AnatomyViewLab>;
  return typeof v.film === "function" && typeof v.advance === "function" ? (v as Lab) : null;
};

/** The song's title and where it comes from, for the start of the video. A spoken text has none. */
function creditsOf(p: Performance, s: State): { title: string; source: string } {
  if (p.kind !== "sing") return { title: "", source: "" };
  const song = s.song === "imported" ? undefined : songById(s.song);
  return { title: p.title, source: song && song.title === p.title ? song.credit : "" };
}

export function mountFilm(app: App, stage: Stage, go: () => void): Film {
  const { store, sound } = app;
  const lab = labOf(stage.view);
  const settings: Settings = { shape: "16:9", fps: 30, quality: "standard", captions: true, look: "score", motion: "cinematic", seed: 1 };
  /** The motion the settings ask for. */
  const motionSpec = (): MotionSpec => (settings.motion === "random" ? randomMotion(settings.seed) : (MOTIONS.find((m) => m.id === settings.motion) ?? MOTIONS.find((m) => m.id === "cinematic")!).spec);
  let on = false;
  let busy: Busy = null;
  let shape: Shape = shapeById(settings.shape);

  // ── the frame on the page: the composed picture, and its corners marked ──
  const picture = el("canvas.film-picture", { "aria-label": "The video's frame, as it will be recorded" });
  const ctx = picture.getContext("2d", { alpha: false })!;
  const edge = el("div.film-edge", { "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i"));

  // ── the chooser: the shape, and how it is recorded ──
  const shapes = choice<ShapeId>({
    label: "Frame",
    options: SHAPES.map((s) => ({ value: s.id, label: `${s.id}   ${s.width} × ${s.height}` })),
    value: settings.shape,
    pick: (id) => {
      settings.shape = id;
      chooser.hidden = true;
      enter();
    },
  });
  // Each shape says what it is for, quietly, under its numbers.
  shapes.root.querySelectorAll(".option").forEach((option, i) => option.append(el("small.film-use", {}, SHAPES[i].use)));
  const rate = choice<"30" | "60">({ label: "Frame rate", row: true, options: [{ value: "30", label: "30 fps" }, { value: "60", label: "60 fps" }], value: "30", pick: (v) => (settings.fps = v === "60" ? 60 : 30) });
  const quality = choice<Quality>({
    label: "Quality",
    row: true,
    options: [{ value: "light", label: "Light" }, { value: "standard", label: "Standard" }, { value: "high", label: "High" }],
    value: settings.quality,
    pick: (v) => (settings.quality = v),
  });
  const captions = toggle("Captions", settings.captions, (v) => {
    settings.captions = v;
    captions.set(v);
  });
  const looks = choice<LookId>({
    label: "Look",
    options: LOOKS.map((l) => ({ value: l.id, label: l.name })),
    value: settings.look,
    pick: (id) => {
      settings.look = lookById(id);
      roomKey = "";
      timeline.reset();
      paint();
    },
  });
  looks.root.querySelectorAll(".option").forEach((option, i) => option.append(el("small.film-use", {}, LOOKS[i].use)));
  const motions = choice<string>({
    label: "Motion",
    options: MOTIONS.map((m) => ({ value: m.id, label: m.name })),
    value: settings.motion,
    pick: (id) => {
      settings.motion = id;
      lab?.motion(motionSpec());
      direct();
      paint();
    },
  });
  motions.root.querySelectorAll(".option").forEach((option, i) => option.append(el("small.film-use", {}, MOTIONS[i].use)));
  // A motion nobody has seen yet: any camera move, at any pace and strength that look right.
  const surprise = action("Surprise me", () => {
    settings.motion = "random";
    settings.seed = Math.floor(Math.random() * 1e9);
    lab?.motion(motionSpec());
    direct();
    const spec = motionSpec();
    app.remark(`A new motion: ${spec.camera === "close" ? "close-ups" : spec.camera}, ${spec.strength > 0.7 ? "bold" : spec.strength > 0.5 ? "steady" : "gentle"}, a ${Math.round(spec.period)}-second cycle.`);
    paint();
  });
  surprise.classList.add("film-surprise");
  const leave = action("Close video", () => {
    chooser.hidden = true;
    exit();
  });
  // What Video is for, said once where it starts.
  const how = el("p.film-how", {}, "Choose a shape, a look and a motion. Play the song to see it in the frame, then Record fast to save it as a video.");
  // On a phone the bar keeps only Record fast and Close; the other two are here.
  const phoneActions = el("div.film-phone-actions", {}, action("Save frame", () => void savePicture()), action("Record live", () => {
    chooser.hidden = true;
    void startLive();
  }));
  const more = section("More", false, rate.root, quality.root);
  const chooser = el("div.film-chooser", { hidden: true, role: "dialog", "aria-label": "Video" }, how, shapes.root, looks.root, motions.root, surprise, el("div.film-toggles", {}, captions.root), phoneActions, more.root, leave);

  // ── the top bar's corner ──
  const entry = el("button.mode.film-entry", { type: "button", "aria-expanded": "false", onclick: () => {
    if (busy) return;
    chooser.hidden = !chooser.hidden;
    paint();
  } }, "Video");
  const saveFrame = action("Save frame", () => void savePicture());
  saveFrame.classList.add("film-wide");
  const live = action("Record live", () => void (busy?.kind === "live" ? stopLive() : startLive()));
  live.classList.add("film-wide");
  const fast = action("Record fast", () => void (busy?.kind === "fast" ? (busy.cancelled = true) : recordFast()));
  const status = el("span.film-status.num");
  const line = el("span.film-progress", { "aria-hidden": "true" });
  // Always in sight while filming: the way out.
  const close = el("button.action.film-close", { type: "button", "aria-label": "Close video", title: "Close video (Esc)", onclick: () => {
    chooser.hidden = true;
    exit();
  } }, "Close");
  const bar = el("div.film-bar", { hidden: true }, saveFrame, live, fast, el("span.film-state", {}, status, line), close);
  const top = el("div.film-top", {}, entry, bar);

  function paint(): void {
    document.body.classList.toggle("filming", on);
    document.body.classList.toggle("choosing", !chooser.hidden);
    entry.setAttribute("aria-expanded", String(!chooser.hidden));
    entry.textContent = on ? `Video · ${shape.id}` : "Video";
    entry.toggleAttribute("aria-current", on);
    bar.hidden = !on;
    leave.hidden = !on;
    shapes.set(on ? settings.shape : ("" as ShapeId));
    saveFrame.disabled = !!busy;
    live.disabled = busy?.kind === "fast";
    fast.disabled = busy?.kind === "live";
    live.textContent = busy?.kind === "live" ? "Stop recording" : "Record live";
    close.disabled = !!busy;
    looks.set(settings.look);
    motions.set(settings.motion === "random" ? "" : settings.motion);
    fast.textContent = busy?.kind === "fast" ? "Cancel" : "Record fast";
    live.classList.toggle("on", busy?.kind === "live");
    status.textContent = busy?.kind === "fast" ? `${Math.round(busy.done * 100)}%` : busy?.kind === "live" ? clock(busy.take.seconds()) : "";
    line.hidden = busy?.kind !== "fast";
    line.style.setProperty("--done", busy?.kind === "fast" ? busy.done.toFixed(3) : "0");
  }

  // Escape closes the chooser, and then the video (not while a recording runs).
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !on) return;
    if (!chooser.hidden) chooser.hidden = true;
    else exit();
    paint();
  });

  // Clicking anywhere else closes the chooser.
  window.addEventListener("pointerdown", (event) => {
    if (chooser.hidden || chooser.contains(event.target as Node) || entry.contains(event.target as Node)) return;
    chooser.hidden = true;
    paint();
  });

  // ── where the frame goes: the largest of its shape in the space the controls leave ──
  let frameBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  function place(): void {
    if (!on) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const gap = 18;
    const visible = (node: Element | null): DOMRect | null => {
      if (!(node instanceof HTMLElement) || node.hidden || !node.getClientRects().length) return null;
      const box = node.getBoundingClientRect();
      return box.width && box.height && getComputedStyle(node).visibility !== "hidden" ? box : null;
    };
    const topBox = visible(document.querySelector(".top"));
    const phone = W <= 1000;
    // The side lists count even while the chooser has stepped the controls aside: the frame stays put.
    const side = (node: Element | null) => (node instanceof HTMLElement && !node.hidden && node.getClientRects().length ? node.getBoundingClientRect() : null);
    const left = phone ? null : side(document.querySelector(".parts"));
    const right = phone ? null : side(document.querySelector(".controls"));
    let bottom = H - gap;
    const floor = document.querySelector(".floor");
    for (const child of [...(floor?.children ?? []), document.querySelector(".band-strip")]) {
      const box = visible(child);
      if (box) bottom = Math.min(bottom, box.top - gap);
    }
    const x0 = left ? left.right + gap : gap;
    const x1 = right ? right.left - gap : W - gap;
    const y0 = (topBox ? topBox.bottom : 0) + gap;
    frameBox = letterbox({ x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, bottom - y0) }, shape.width, shape.height);
    const css = `left:${frameBox.x}px;top:${frameBox.y}px;width:${frameBox.w}px;height:${frameBox.h}px;`;
    picture.style.cssText = css;
    edge.style.cssText = css;
    // The body's own canvas sits under the picture, the same size, so it can still be turned and grabbed.
    stage.canvas.style.cssText = `${css}right:auto;bottom:auto;`;
  }
  new ResizeObserver(() => place()).observe(document.documentElement);
  window.addEventListener("resize", place);
  store.on(["mode", "sheet", "playing"], () => requestAnimationFrame(place));

  // ── what each frame shows ──
  const cue = new Cue();
  const timeline = new Timeline();
  let roomKey = "";
  let lastDraw = 0;
  /** While a fast recording runs: its telemetry and which frame is being drawn. */
  let fastSource: { rendered: Rendered; voices: number; players: number; frame: number; fps: number; performance: Performance; singers: Singer[] } | null = null;
  /** When the performance on the stage began, for its title (live). */
  let liveSince = -1;
  store.on(["playing"], (s, before) => {
    if (s.playing && s.playing !== before.playing) liveSince = performance.now();
    if (!s.playing) liveSince = -1;
    direct();
  });

  /**
   * The Cinematic camera is directed from the song: its shot list, read off the song's clock (the
   * recording's frame when fast, the sound's position live). With nothing performed, or another
   * motion, the camera follows the voices as they are heard.
   */
  function direct(): void {
    if (!lab) return;
    const spec = motionSpec();
    if (!on || spec.camera !== "cinematic") return lab.direct(null, null);
    if (fastSource) {
      const f = fastSource;
      return lab.direct(planFor(f.performance, f.singers, spec.seed, spec.strength), () => (fastSource ? fastSource.frame / fastSource.fps - LEAD : null));
    }
    const playing = store.get().playing;
    if (!playing) return lab.direct(null, null);
    const singers = castOf(store.get()).map((x) => ({ name: x.name, seat: x.seat, score: x.score }));
    lab.direct(planFor(playing, singers, spec.seed, spec.strength), () => {
      if (store.get().playing !== playing) return null;
      const at = sound.position(0);
      return at >= 0 ? at : null;
    });
  }

  function momentNow(dt: number): { moment: Moment; singers: Singer[] } {
    const s = store.get();
    if (fastSource) {
      const f = fastSource;
      const k = f.frame;
      const credits = creditsOf(f.performance, s);
      const t = Math.max(0, k / f.fps);
      const moment = cue.moment(
        { ...credits, since: t, lead: { seat: 0, score: f.performance.parts[0].score }, singers: f.singers, band: f.performance.band ?? [], captions: f.performance.captions },
        (seat) => f.rendered.telemetry.subarray((k * f.voices + seat) * TELEMETRY_SIZE, (k * f.voices + seat + 1) * TELEMETRY_SIZE),
        (seat) => (seat < f.voices ? t - LEAD : -1),
        (slot) => f.rendered.instruments.subarray((k * f.players + slot) * INSTRUMENT_TELEMETRY_SIZE, (k * f.players + slot + 1) * INSTRUMENT_TELEMETRY_SIZE),
        dt,
      );
      return { moment, singers: f.singers };
    }
    const playing = s.playing;
    const singers = castOf(s).map((x) => ({ name: x.name, seat: x.seat, score: x.score }));
    const credits = playing ? creditsOf(playing, s) : { title: "", source: "" };
    const moment = cue.moment(
      { ...credits, since: liveSince < 0 ? -1 : (performance.now() - liveSince) / 1000, lead: playing ? { seat: 0, score: playing.parts[0].score } : null, singers, band: playing?.band ?? [], captions: playing?.captions },
      (seat) => sound.telemetry(seat),
      (seat) => (playing ? sound.position(seat) : -1),
      (slot) => sound.instrument(slot),
      dt,
    );
    return { moment, singers };
  }

  function layoutFor(m: Moment, singers: Singer[], look: LookId = settings.look): Layout {
    const s = store.get();
    const spoken = !!(fastSource?.performance ?? s.playing ?? null) || s.mode === "sing" || s.mode === "speak";
    const p = fastSource?.performance ?? s.playing ?? null;
    return layout({
      width: shape.width,
      height: shape.height,
      captions: settings.captions && spoken,
      instruments: m.band.length,
      choir: singers.length > 1,
      titled: titled(m.since) && !!m.title,
      look,
      // A song's own lines in every look; any other song's words as lines too, but on the Stage,
      // which shows the word being sung and its sounds.
      lyric: !!p?.captions?.length || (look !== "stage" && p?.kind === "sing" && !!p.parts[0]?.score.words?.length),
    });
  }

  // ── Scenes: the look changes with the song, as an editor cuts a film ──
  /** The look for each line of the song, in turn; the band alone has the band's look. */
  const SCENES: LookId[] = ["stage", "stage", "score", "heads", "stage", "band", "score", "stage"];
  let scene: LookId = "band";
  let sceneSeen = false;
  /** The last frame of the scene before, dissolving into the new one, and seconds of dissolve left. */
  const dissolve = document.createElement("canvas");
  let dissolveLeft = 0;
  const DISSOLVE = 0.6;
  function lookFor(m: Moment): LookId {
    if (settings.look !== "scenes") return settings.look;
    if (m.lyric) {
      sceneSeen = true;
      return SCENES[m.lyric.line % SCENES.length];
    }
    // before the voices the band's look; between and after lines, the scene goes on
    return sceneSeen ? scene : "band";
  }

  /** Draw the frame: called by the view each time it has drawn the heads. */
  function compose(): void {
    if (!on || !lab) return;
    const now = performance.now();
    const dt = fastSource ? 1 / fastSource.fps : lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0;
    lastDraw = now;
    const { moment, singers } = momentNow(dt);
    const look = lookFor(moment);
    if (look !== scene) {
      // a new scene: what is on the frame now dissolves into it
      dissolve.width = picture.width;
      dissolve.height = picture.height;
      dissolve.getContext("2d")!.drawImage(picture, 0, 0);
      dissolveLeft = DISSOLVE;
      scene = look;
      timeline.reset();
    }
    const l = layoutFor(moment, singers, look);
    drawFrame(ctx, stage.canvas, l, moment, { captions: settings.captions, look }, (i) => lab.spot(i), timeline, dt);
    if (dissolveLeft > 0) {
      ctx.globalAlpha = Math.max(0, dissolveLeft / DISSOLVE) ** 1.5;
      ctx.drawImage(dissolve, 0, 0);
      ctx.globalAlpha = 1;
      dissolveLeft -= dt;
    }
    // The heads are framed for what is around them; a change (the title going) is eased by the view.
    const key = l.room.map(Math.round).join(",");
    if (key !== roomKey) {
      roomKey = key;
      lab.film({ width: shape.width, height: shape.height, room: l.room, names: singers.length > 1 ? l.names.tall : 0, ...(fastSource ? { singers: castFor(fastSource.performance, fastSource.singers) } : {}) });
    }
  }

  /** The view's cast for a performance: each head's name and body, as the stage would seat them. */
  function castFor(p: Performance, singers: Singer[]) {
    const all = castOf({ ...store.get(), playing: p });
    return singers.map((x, i) => ({ name: x.name, body: sizedBody(all[i]?.body ?? p.parts[x.seat]?.body ?? 3, all[i]?.size ?? p.parts[x.seat]?.size) }));
  }

  function enter(): void {
    if (!lab) {
      app.remark("Video needs the body drawn, and this device cannot draw it (it needs WebGL 2).");
      return;
    }
    shape = shapeById(settings.shape);
    picture.width = shape.width;
    picture.height = shape.height;
    on = true;
    roomKey = "";
    lab.onDrawn = compose;
    lab.motion(motionSpec());
    direct();
    lab.film({ width: shape.width, height: shape.height, room: layoutFor(momentNow(0).moment, castOf(store.get())).room, names: castOf(store.get()).length > 1 ? layoutFor(momentNow(0).moment, castOf(store.get())).names.tall : 0 });
    paint();
    place();
  }

  function exit(): void {
    if (busy) return;
    on = false;
    if (lab) {
      lab.onDrawn = null;
      lab.motion(null);
      lab.direct(null, null);
      lab.film(null);
    }
    stage.canvas.style.cssText = "";
    paint();
  }

  // ── saving one frame ──
  async function savePicture(): Promise<void> {
    if (!on) return;
    const s = store.get();
    const file = await new Promise<Blob | null>((done) => picture.toBlob(done, "image/png"));
    if (!file) return app.remark("The frame could not be saved.");
    save(file, videoName(s.playing?.title ?? s.last?.title ?? "frame", shape.width, shape.height, "png"));
    app.remark(`Saved the frame, ${shape.width} × ${shape.height}.`);
  }

  // ── recording live ──
  let watching: (() => void) | null = null;
  async function startLive(): Promise<void> {
    if (busy || !on) return;
    if (!(await sound.wake())) return app.remark("The sound has to be on to record it. Click once anywhere, then try again.");
    let take: Take;
    try {
      take = recordLive(picture, sound.stream(), settings.fps, bitrateFor(shape.width, shape.height, settings.fps, settings.quality));
    } catch (error) {
      console.error(error);
      return app.remark("This browser cannot record the page.");
    }
    const s = store.get();
    // Speak and Sing start their performance with the recording, and it stops a moment after
    // the performance does; Touch and the Instrument are recorded until stopped.
    const auto = !s.playing && (s.mode === "sing" || s.mode === "speak");
    busy = { kind: "live", take, auto };
    if (auto) go();
    watching = store.on(["playing"], (now, before) => {
      if (busy?.kind === "live" && busy.auto && before.playing && !now.playing) setTimeout(() => void stopLive(), 900);
    });
    paint();
  }

  async function stopLive(): Promise<void> {
    if (busy?.kind !== "live") return;
    const take = busy.take;
    watching?.();
    watching = null;
    busy = null;
    paint();
    try {
      const { file, extension } = await take.stop();
      const s = store.get();
      save(file, videoName(s.last?.title ?? "voice", shape.width, shape.height, extension));
      app.remark(`Saved ${clock(take.seconds())} of video, recorded as it played.`);
      lastFile = { name: videoName(s.last?.title ?? "voice", shape.width, shape.height, extension), bytes: file.size, seconds: take.seconds(), took: take.seconds(), container: extension };
    } catch (error) {
      console.error(error);
      app.remark("The recording could not be saved.");
    }
  }

  // ── recording fast ──
  let lastFile: { name: string; bytes: number; seconds: number; took: number; container: string; spent?: Record<string, number> } | null = null;
  async function recordFast(options: { webm?: boolean } = {}): Promise<void> {
    if (busy || !on || !lab) return;
    const s = store.get();
    const p = s.last;
    if (!p) return app.remark(`Nothing to record yet. ${s.mode === "speak" ? "Speak" : "Sing"} something first; Record fast makes a video of the last performance.`);
    if (s.playing) app.stop();
    const job = busy = { kind: "fast" as const, done: 0, cancelled: false };
    paint();
    const began = performance.now();
    const fps = settings.fps;
    const frames = Math.ceil((LEAD + lengthOf(p) + TAIL) * fps);
    const filmJob: FilmJob = { ...jobFor(p, s.bandLevel), fps, lead: LEAD, frames };
    const progress = (done: number) => {
      job.done = done;
      paint();
    };
    let encoding: Awaited<ReturnType<typeof encode>> | null = null;
    try {
      const chosen = await plan(shape.width, shape.height, fps, bitrateFor(shape.width, shape.height, fps, settings.quality), filmJob.sampleRate, options.webm);
      // Where the time goes, in seconds: for the check tool, and for whoever makes it faster.
      const spent = { sound: 0, draw: 0, encode: 0, finish: 0 };
      let mark = performance.now();
      const lap = (what: keyof typeof spent) => {
        const now = performance.now();
        spent[what] += (now - mark) / 1000;
        mark = now;
      };
      const rendered = await renderFilm(filmJob, s.room, (d) => progress(d * 0.25), () => job.cancelled);
      lap("sound");
      encoding = await encode(chosen, fps, { channels: rendered.channels, sampleRate: filmJob.sampleRate });
      const singers = castOf({ ...s, playing: p }).map((x) => ({ name: x.name, seat: x.seat, score: x.score }));
      fastSource = { rendered, voices: filmJob.parts.length, players: (filmJob.band ?? []).length, frame: 0, fps, performance: p, singers };
      direct();
      lab.hold(true);
      lab.pin(0);
      roomKey = "";
      // The heads arrive and are framed before the first frame is kept.
      for (let i = 0; i < SETTLE; i++) {
        singers.forEach((x, h) => lab.frameOf(h, rendered.telemetry.subarray(x.seat * TELEMETRY_SIZE, (x.seat + 1) * TELEMETRY_SIZE)));
        lab.advance(1 / fps);
      }
      cue.reset();
      timeline.reset();
      sceneSeen = false;
      scene = settings.look === "scenes" ? "band" : settings.look;
      dissolveLeft = 0;
      for (let k = 0; k < frames; k++) {
        if (job.cancelled) throw new Error("cancelled");
        fastSource.frame = k;
        const base = k * fastSource.voices;
        singers.forEach((x, h) => lab.frameOf(h, rendered.telemetry.subarray((base + x.seat) * TELEMETRY_SIZE, (base + x.seat + 1) * TELEMETRY_SIZE)));
        mark = performance.now();
        lab.advance(1 / fps);
        lap("draw");
        await encoding.frame(picture, k);
        lap("encode");
        if (k % 4 === 0) {
          progress(0.25 + (0.75 * k) / frames);
          // Let the page breathe: the progress shows, and Cancel can be pressed.
          await new Promise((done) => setTimeout(done, 0));
        }
      }
      mark = performance.now();
      const { file, extension } = await encoding.finish();
      lap("finish");
      const name = videoName(p.title, shape.width, shape.height, extension);
      save(file, name);
      const took = (performance.now() - began) / 1000;
      lastFile = { name, bytes: file.size, seconds: frames / fps, took, container: extension, spent };
      app.remark(`Saved ${clock(frames / fps)} of video, made in ${took.toFixed(1)} seconds.`);
    } catch (error) {
      encoding?.abandon();
      if (job.cancelled) app.remark("The recording was cancelled.");
      else {
        console.error(error);
        app.remark(error instanceof Error && /browser/.test(error.message) ? error.message : "The video could not be made. Play it once more, then try again.");
      }
    } finally {
      fastSource = null;
      direct();
      busy = null;
      roomKey = "";
      lab.pin(-1);
      lab.hold(false);
      // The page's own cast comes back.
      lab.film({ width: shape.width, height: shape.height, room: layoutFor(momentNow(0).moment, castOf(store.get())).room, names: castOf(store.get()).length > 1 ? layoutFor(momentNow(0).moment, castOf(store.get())).names.tall : 0 });
      paint();
    }
  }

  // The live recording's clock ticks along.
  setInterval(() => busy?.kind === "live" && paint(), 500);

  // For tools/film-check.ts and the console.
  Object.assign(window, {
    orpheonFilm: {
      open: (id: ShapeId) => {
        settings.shape = id;
        enter();
      },
      set: (patch: Partial<Settings>) => {
        Object.assign(settings, patch);
        if (on) lab?.motion(motionSpec());
        direct();
      },
      close: exit,
      fast: (options: { webm?: boolean } = {}) => recordFast(options).then(() => lastFile),
      live: startLive,
      stop: () => stopLive().then(() => lastFile),
      state: () => ({ on, shape: shape.id, busy: busy?.kind ?? null, frame: { ...frameBox }, last: lastFile }),
      /** Milliseconds a frame's steps take, averaged over `n` frames: the heads alone, the composing, a VideoFrame of the result. */
      bench(n = 30) {
        if (!on || !lab) return null;
        const took = { heads: 0, compose: 0, grab: 0 };
        const pixel = new Uint8Array(4);
        const gl = stage.canvas.getContext("webgl2");
        lab.hold(true);
        const was = lab.onDrawn;
        for (let i = 0; i < n; i++) {
          lab.onDrawn = null;
          let t = performance.now();
          lab.advance(1 / 30);
          gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          took.heads += performance.now() - t;
          t = performance.now();
          compose();
          took.compose += performance.now() - t;
          t = performance.now();
          new VideoFrame(picture, { timestamp: i }).close();
          took.grab += performance.now() - t;
        }
        lab.onDrawn = was;
        lab.hold(false);
        return { heads: took.heads / n, compose: took.compose / n, grab: took.grab / n };
      },
    },
  });

  paint();
  return { entry: top, root: el("div.film", {}, picture, edge, chooser) };
}
