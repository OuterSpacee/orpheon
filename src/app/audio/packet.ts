// The layout of the one Float32Array the audio thread posts to the page about sixty times a
// second: a short header, then for each of the six seats a short header and its voice's
// telemetry, then for each place in the band a short header and its instrument's telemetry.
// The same few buffers go back and forth for ever, so nothing is allocated while sound runs.
import { INSTRUMENT_TELEMETRY_SIZE, TELEMETRY_SIZE } from "../../contract.ts";

/** How many voices the worklet can host. */
export const SEATS = 6;
/** How many instruments the band can hold at once. */
export const BAND_SLOTS = 8;

/** Packet header, in floats. */
export const HEAD = { clock: 0, peak: 2, faults: 3, size: 8 } as const;
/** Seat header, in floats from the seat's start. */
export const SEAT = { alive: 0, time: 1, start: 3, take: 5, peak: 6, size: 8 } as const;
/** Band slot header, in floats from the slot's start. */
export const SLOT = { alive: 0, peak: 1, size: 4 } as const;

export const SEAT_SPAN = SEAT.size + TELEMETRY_SIZE;
export const SLOT_SPAN = SLOT.size + INSTRUMENT_TELEMETRY_SIZE;

export const seatAt = (seat: number): number => HEAD.size + seat * SEAT_SPAN;
export const telemetryAt = (seat: number): number => seatAt(seat) + SEAT.size;
export const slotAt = (slot: number): number => seatAt(SEATS) + slot * SLOT_SPAN;
export const instrumentAt = (slot: number): number => slotAt(slot) + SLOT.size;

export const PACKET_SIZE = slotAt(BAND_SLOTS);

/**
 * A clock in seconds needs more precision than one float32 holds after a few minutes, so it
 * travels as two floats: whole seconds and the rest. A negative clock ("none") travels as -1, 0.
 */
export function putClock(into: Float32Array, at: number, seconds: number): void {
  if (seconds < 0) {
    into[at] = -1;
    into[at + 1] = 0;
    return;
  }
  const whole = Math.floor(seconds);
  into[at] = whole;
  into[at + 1] = seconds - whole;
}

export const getClock = (from: Float32Array, at: number): number => from[at] + from[at + 1];
