// The page's side of the sound: the audio context, the worklet that hosts the voices, the room
// and limiter after it, and the newest packet of telemetry. Nothing here touches the DOM.
import { INSTRUMENT_TELEMETRY_SIZE, TELEMETRY_SIZE } from "../../contract.ts";
import type { BandNote, Body, InstrumentId, Pose, Score } from "../../contract.ts";
import { buildChain } from "./chain.ts";
import type { Chain } from "./chain.ts";
import type { ToVoices } from "./messages.ts";
import { BAND_SLOTS, HEAD, PACKET_SIZE, SEAT, SEATS, SLOT, getClock, instrumentAt, seatAt, slotAt, telemetryAt } from "./packet.ts";
// Vite bundles the worklet as its own file and hands back the address to load it from.
import workletUrl from "./worklet.ts?worker&url";

export type Wakefulness = "asleep" | "waking" | "awake" | "failed";

export interface Sound {
  readonly state: Wakefulness;
  /** When state is "failed": what to tell the person. */
  readonly why: string;
  /** Start (or resume) the audio. Must be called from a click or a key press the first time. */
  wake(): Promise<boolean>;

  add(seat: number, body: Body, level: number, place: number): void;
  /** Is a voice seated there (as the page asked; the audio thread follows)? */
  has(seat: number): boolean;
  remove(seat: number): void;
  setBody(seat: number, body: Body): void;
  mix(seat: number, level: number, place: number): void;
  aim(seat: number, pose: Partial<Pose>): void;
  /** Perform a score a moment from now. Several calls in the same task start together. */
  perform(seat: number, score: Score): void;
  hush(seat: number): void;

  /** The band: seat an instrument in a slot (0..7), with its level and place. */
  seatInstrument(slot: number, id: InstrumentId, level: number, place: number): void;
  unseatInstrument(slot: number): void;
  mixInstrument(slot: number, level: number, place: number): void;
  /** Play notes on an instrument, starting with any perform() made in the same task. */
  play(slot: number, notes: BandNote[]): void;
  strike(slot: number, midi: number, velocity: number): void;
  hushInstrument(slot: number): void;
  /** The whole band's level, 0..1. */
  setBandLevel(level: number): void;
  /** The slot's newest instrument telemetry (loudness first), updated in place; zeros for an empty slot. */
  instrument(slot: number): Float32Array;
  /** Is an instrument seated in the slot, as the audio thread last said? */
  seated(slot: number): boolean;

  setVolume(amount: number): void;
  setRoom(amount: number): void;

  /** The seat's newest telemetry, laid out as TELEMETRY. The same array every time, updated in place. */
  telemetry(seat: number): Float32Array;
  /** Seconds into its score the seat is at, as heard right now; 0 before it starts, -1 with no score. */
  position(seat: number): number;
  /** Loudest sample leaving the page in the last few milliseconds, after the limiter. */
  level(): number;
  /** Loudest sample the voices made since the last packet, before the room and limiter. */
  peak(): number;
  /** Samples a voice produced that were not numbers. More than 0 means the engine broke. */
  faults(): number;
  sampleRate(): number;
  /** The sound leaving the page, as a stream to record (the video's live recording); null until the audio wakes. */
  stream(): MediaStream | null;

  /** Called after each packet lands (about sixty times a second). */
  onFrame: (() => void) | null;
  onState: ((state: Wakefulness) => void) | null;
}

interface Wish {
  body: Body;
  level: number;
  place: number;
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let chain: Chain | null = null;
  let meter: AnalyserNode | null = null;
  let tap: MediaStreamAudioDestinationNode | null = null;
  let waking: Promise<boolean> | null = null;
  let state: Wakefulness = "asleep";
  let why = "";
  let volume = 0.8;
  let room = 0.25;
  let take = 0;

  const latest = new Float32Array(PACKET_SIZE);
  const views: Float32Array[] = [];
  for (let i = 0; i < SEATS; i++) views.push(latest.subarray(telemetryAt(i), telemetryAt(i) + TELEMETRY_SIZE));
  const instruments: Float32Array[] = [];
  for (let i = 0; i < BAND_SLOTS; i++) instruments.push(latest.subarray(instrumentAt(i), instrumentAt(i) + INSTRUMENT_TELEMETRY_SIZE));
  const bandWishes: ({ id: InstrumentId; level: number; place: number } | null)[] = new Array(BAND_SLOTS).fill(null);
  let bandLevel = 0.8;
  // Everything asked to start in one task is given one start time, so it all starts on one sample.
  let batch: number | null = null;
  const startTime = (c: AudioContext): number => {
    if (batch === null) {
      // A twentieth of a second ahead: time for the message to arrive, so the start is exact.
      batch = c.currentTime + 0.05;
      queueMicrotask(() => (batch = null));
    }
    return batch;
  };
  // Who should be seated, remembered so they can be seated when the audio wakes.
  const wishes: (Wish | null)[] = new Array(SEATS).fill(null);
  const takes: number[] = new Array(SEATS).fill(0);
  const scope = new Float32Array(1024);

  const sound: Sound = {
    get state() {
      return state;
    },
    get why() {
      return why;
    },
    wake,
    add(seat, body, level, place) {
      wishes[seat] = { body, level, place };
      post({ type: "add", seat, body, level, place });
    },
    has: (seat) => wishes[seat] !== null && wishes[seat] !== undefined,
    remove(seat) {
      wishes[seat] = null;
      takes[seat] = 0;
      post({ type: "remove", seat });
    },
    setBody(seat, body) {
      const wish = wishes[seat];
      if (!wish) return;
      wish.body = body;
      post({ type: "body", seat, body });
    },
    mix(seat, level, place) {
      const wish = wishes[seat];
      if (!wish) return;
      wish.level = level;
      wish.place = place;
      post({ type: "mix", seat, level, place });
    },
    aim: (seat, pose) => post({ type: "aim", seat, pose }),
    perform(seat, score) {
      if (!ctx || !node) return;
      takes[seat] = ++take;
      post({ type: "perform", seat, score, when: startTime(ctx), take });
    },
    hush(seat) {
      takes[seat] = 0;
      post({ type: "hush", seat });
    },
    seatInstrument(slot, id, level, place) {
      bandWishes[slot] = { id, level, place };
      post({ type: "instrument", slot, id, level, place });
    },
    unseatInstrument(slot) {
      bandWishes[slot] = null;
      post({ type: "unseat", slot });
    },
    mixInstrument(slot, level, place) {
      const wish = bandWishes[slot];
      if (!wish) return;
      wish.level = level;
      wish.place = place;
      post({ type: "bandmix", slot, level, place });
    },
    play(slot, notes) {
      if (!ctx || !node) return;
      post({ type: "play", slot, notes, when: startTime(ctx) });
    },
    strike: (slot, midi, velocity) => post({ type: "strike", slot, midi, velocity }),
    hushInstrument: (slot) => post({ type: "bandhush", slot }),
    setBandLevel(level) {
      bandLevel = level;
      post({ type: "bandlevel", level });
    },
    instrument: (slot) => instruments[slot],
    seated: (slot) => latest[slotAt(slot) + SLOT.alive] > 0,
    setVolume(amount) {
      volume = amount;
      chain?.setVolume(amount);
    },
    setRoom(amount) {
      room = amount;
      chain?.setRoom(amount);
    },
    telemetry: (seat) => views[seat],
    position(seat) {
      if (!ctx || !takes[seat]) return -1;
      const at = seatAt(seat);
      // Until a packet echoes this take, the start time in hand belongs to an older performance.
      if (latest[at + SEAT.take] !== takes[seat] || latest[at + SEAT.start] < 0) return 0;
      // What is heard now left the voice a little ago: the output's latency.
      const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      const voiceTime = getClock(latest, at + SEAT.time) + (heard - getClock(latest, HEAD.clock));
      return Math.max(0, voiceTime - getClock(latest, at + SEAT.start));
    },
    level() {
      if (!meter) return 0;
      meter.getFloatTimeDomainData(scope);
      let peak = 0;
      for (let i = 0; i < scope.length; i++) {
        const a = scope[i] < 0 ? -scope[i] : scope[i];
        if (a > peak) peak = a;
      }
      return peak;
    },
    peak: () => latest[HEAD.peak],
    faults: () => latest[HEAD.faults],
    sampleRate: () => ctx?.sampleRate ?? 0,
    stream() {
      if (!ctx || !chain) return null;
      if (!tap) {
        tap = ctx.createMediaStreamDestination();
        chain.output.connect(tap);
      }
      return tap.stream;
    },
    onFrame: null,
    onState: null,
  };

  function post(message: ToVoices): void {
    node?.port.postMessage(message);
  }

  function become(next: Wakefulness, reason = ""): void {
    why = reason;
    if (state === next) return;
    state = next;
    sound.onState?.(state);
  }

  function wake(): Promise<boolean> {
    if (state === "awake" && ctx?.state === "running") return Promise.resolve(true);
    // Everything a phone's browser allows only inside the gesture happens now, before anything
    // waits: iOS Safari unlocks audio only for a resume() called while the tap is still being
    // handled (after an await it is no longer the tap's), and plays Web Audio through the ringer,
    // which the silent switch mutes, unless the page says it is playing media.
    if (typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined") {
      try {
        ctx ??= new AudioContext({ latencyHint: "interactive" });
        if (ctx.state !== "running") void ctx.resume().catch(() => {});
      } catch {
        // start() says why
      }
      playAsMedia();
    }
    waking ??= start().finally(() => (waking = null));
    return waking;
  }

  /**
   * Ask for the media session, so a phone's silent switch does not mute the voice: Safari 17's
   * audioSession, and for older iOS a silent clip played in a loop from an <audio> element (an
   * element that plays makes the page's whole audio media). Once is enough.
   */
  let media: HTMLAudioElement | null = null;
  function playAsMedia(): void {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        // not allowed: the clip below does it
      }
    }
    if (media || typeof document === "undefined" || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) || !("ontouchend" in document)) return;
    media = document.createElement("audio");
    media.setAttribute("playsinline", "");
    media.loop = true;
    media.src = silentClip();
    void media.play().catch(() => {});
  }

  async function start(): Promise<boolean> {
    if (typeof AudioWorkletNode === "undefined" || typeof AudioContext === "undefined") {
      become("failed", "This browser cannot run the voice. Open the page in a current Chrome, Edge, Firefox or Safari.");
      return false;
    }
    become("waking");
    try {
      // No sample rate asked for: the voice runs at whatever the device reports.
      ctx ??= new AudioContext({ latencyHint: "interactive" });
      if (!node) await build(ctx);
      // resume() waits for ever if the browser decides this was not a real gesture; don't wait with it.
      await Promise.race([ctx.resume(), new Promise((done) => setTimeout(done, 1500))]);
      if (ctx.state !== "running") {
        become("asleep");
        return false;
      }
      become("awake");
      return true;
    } catch (error) {
      console.error(error);
      become("failed", "The voice could not start. Check that this tab is allowed to play sound, then try again.");
      return false;
    }
  }

  async function build(ctx: AudioContext): Promise<void> {
    await ctx.audioWorklet.addModule(workletUrl);
    const made = new AudioWorkletNode(ctx, "orpheon-voices", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    made.port.onmessage = (event: MessageEvent<Float32Array<ArrayBuffer>>) => {
      const packet = event.data;
      latest.set(packet);
      made.port.postMessage(packet, [packet.buffer]);
      sound.onFrame?.();
    };
    made.onprocessorerror = () => become("failed", "The voice stopped unexpectedly. Reload the page to bring it back.");
    chain = buildChain(ctx, room, volume);
    meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    made.connect(chain.input);
    chain.output.connect(meter);
    chain.output.connect(ctx.destination);
    // A phone call or another tab can suspend the context; the next gesture wakes it again.
    ctx.onstatechange = () => {
      if (ctx.state === "running") become("awake");
      else if (state === "awake") become("asleep");
    };
    node = made;
    wishes.forEach((wish, seat) => wish && post({ type: "add", seat, ...wish }));
    post({ type: "bandlevel", level: bandLevel });
    bandWishes.forEach((wish, slot) => wish && post({ type: "instrument", slot, ...wish }));
  }

  return sound;
}

/** Half a second of silence as a WAV (8 kHz, 8-bit mono), for an <audio> element to loop. */
function silentClip(): string {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}
