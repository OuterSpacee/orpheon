// Up to six voices, each with a level and a place from left to right, mixed to stereo.
// Used by the AudioWorklet (live) and by the render worker (export), so both sound the same.
// render() and report() allocate nothing. It is handed the function that makes a voice, so it can
// be tested with stand-ins.
import { TELEMETRY_SIZE } from "../../contract.ts";
import type { Body, Pose, Score, Voice } from "../../contract.ts";
import { HEAD, SEAT, SEATS, getClock, putClock, seatAt, telemetryAt } from "./packet.ts";

interface Seat {
  voice: Voice | null;
  /** Gain to each ear now, and where it is heading. */
  left: number;
  right: number;
  goalLeft: number;
  goalRight: number;
  leaving: boolean;
  /** Voice time at which the score being performed began, or -1. */
  start: number;
  take: number;
  peak: number;
}

export class Choir {
  /** Loudest mixed sample since the last report. */
  peak = 0;
  /** Samples a voice produced that were not numbers (replaced by silence). */
  faults = 0;
  private readonly seats: Seat[] = [];
  private scratch = new Float32Array(128);
  private readonly sensed = new Float32Array(TELEMETRY_SIZE);
  /** Gains glide over about 15 ms so a change of level or place never clicks. */
  private readonly ease: number;
  private readonly make: (sampleRate: number, body?: Body) => Voice;

  constructor(
    readonly sampleRate: number,
    make: (sampleRate: number, body?: Body) => Voice,
  ) {
    this.make = make;
    this.ease = 1 - Math.exp(-1 / (0.015 * sampleRate));
    for (let i = 0; i < SEATS; i++) {
      this.seats.push({ voice: null, left: 0, right: 0, goalLeft: 0, goalRight: 0, leaving: false, start: -1, take: 0, peak: 0 });
    }
  }

  add(seat: number, body: Body, level = 1, place = 0): void {
    const s = this.seats[seat];
    if (!s) return;
    s.voice = this.make(this.sampleRate, body);
    s.left = s.right = 0;
    s.leaving = false;
    s.start = -1;
    s.take = 0;
    this.mix(seat, level, place);
  }

  remove(seat: number): void {
    const s = this.seats[seat];
    if (!s?.voice) return;
    s.voice.hush();
    s.leaving = true;
    s.goalLeft = s.goalRight = 0;
  }

  /** Equal power: a voice is as loud at the side as in the middle. */
  mix(seat: number, level: number, place: number): void {
    const s = this.seats[seat];
    if (!s?.voice || s.leaving) return;
    const angle = ((Math.min(1, Math.max(-1, place)) + 1) * Math.PI) / 4;
    s.goalLeft = level * Math.cos(angle);
    s.goalRight = level * Math.sin(angle);
  }

  setBody(seat: number, body: Body): void {
    this.seats[seat]?.voice?.setBody(body);
  }

  aim(seat: number, pose: Partial<Pose>): void {
    this.seats[seat]?.voice?.aim(pose);
  }

  /** Start a score `delay` seconds from now on this voice's own clock. */
  perform(seat: number, score: Score, delay = 0, take = 0): void {
    const s = this.seats[seat];
    if (!s?.voice) return;
    s.start = s.voice.time + Math.max(0, delay);
    s.take = take;
    s.voice.perform(score, s.start);
  }

  hush(seat: number): void {
    const s = this.seats[seat];
    if (!s?.voice) return;
    s.voice.hush();
    s.start = -1;
    s.take = 0;
  }

  has(seat: number): boolean {
    return !!this.seats[seat]?.voice;
  }

  /** Write the next left.length samples of the mix. */
  render(left: Float32Array, right: Float32Array): void {
    const n = left.length;
    // The block size is fixed by the host, so this runs once or never.
    if (this.scratch.length !== n) this.scratch = new Float32Array(n);
    const mono = this.scratch;
    const ease = this.ease;
    left.fill(0);
    right.fill(0);
    for (let k = 0; k < SEATS; k++) {
      const s = this.seats[k];
      if (!s.voice) continue;
      s.voice.render(mono);
      let gl = s.left;
      let gr = s.right;
      let peak = s.peak;
      for (let i = 0; i < n; i++) {
        let x = mono[i];
        // One NaN would poison the room and the limiter after us for good, so it stops here.
        if (!(x > -4 && x < 4)) {
          x = 0;
          this.faults++;
        }
        gl += (s.goalLeft - gl) * ease;
        gr += (s.goalRight - gr) * ease;
        left[i] += x * gl;
        right[i] += x * gr;
        const a = x < 0 ? -x : x;
        if (a > peak) peak = a;
      }
      s.left = gl;
      s.right = gr;
      s.peak = peak;
      if (s.leaving && gl < 1e-4 && gr < 1e-4) {
        s.voice = null;
        s.leaving = false;
      }
    }
    let peak = this.peak;
    for (let i = 0; i < n; i++) {
      const l = left[i] < 0 ? -left[i] : left[i];
      const r = right[i] < 0 ? -right[i] : right[i];
      if (l > peak) peak = l;
      if (r > peak) peak = r;
    }
    this.peak = peak;
  }

  /** Fill a packet with every seat's state. `clock` is the host's time at this instant. */
  report(packet: Float32Array, clock: number): void {
    putClock(packet, HEAD.clock, clock);
    packet[HEAD.peak] = this.peak;
    packet[HEAD.faults] = this.faults;
    this.peak = 0;
    for (let k = 0; k < SEATS; k++) {
      const s = this.seats[k];
      const at = seatAt(k);
      if (!s.voice) {
        packet[at + SEAT.alive] = 0;
        continue;
      }
      packet[at + SEAT.alive] = 1;
      putClock(packet, at + SEAT.time, s.voice.time);
      putClock(packet, at + SEAT.start, s.start);
      packet[at + SEAT.take] = s.take;
      packet[at + SEAT.peak] = s.peak;
      s.peak = 0;
      s.voice.sense(this.sensed);
      packet.set(this.sensed, telemetryAt(k));
    }
  }
}

/** Seconds into its score a seat was at when the packet was made, or -1 if it has none. */
export function scoreTime(packet: Float32Array, seat: number): number {
  const at = seatAt(seat);
  if (!packet[at + SEAT.alive] || packet[at + SEAT.start] < 0) return -1;
  return getClock(packet, at + SEAT.time) - getClock(packet, at + SEAT.start);
}
