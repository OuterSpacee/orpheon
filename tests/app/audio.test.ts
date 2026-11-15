// The audio thread's logic, run here without a browser: the mixer, the packet, the room, the WAV.
// The voices are stand-ins that make a known signal, so the tests do not depend on the engine.
import { describe, expect, test } from "bun:test";
import { INSTRUMENT_TELEMETRY_SIZE, TELEMETRY, TELEMETRY_SIZE } from "../../src/contract.ts";
import type { Body, Pose, Score, Voice } from "../../src/contract.ts";
import { Choir, scoreTime } from "../../src/app/audio/choir.ts";
import { fileName } from "../../src/app/audio/export.ts";
import { BAND_SLOTS, HEAD, PACKET_SIZE, SEAT, SEATS, SLOT, getClock, instrumentAt, putClock, seatAt, slotAt, telemetryAt } from "../../src/app/audio/packet.ts";
import { ROOM, roomImpulse } from "../../src/app/audio/room.ts";
import { encodeWav } from "../../src/app/audio/wav.ts";
import { jobFor } from "../../src/app/save.ts";

/** A voice that puts out a steady `value`, and remembers what it was told. */
function standIn(value: number) {
  const told: string[] = [];
  let performedAt = -1;
  const make = (sampleRate: number, body?: Body): Voice => {
    let time = 0;
    return voice(sampleRate, body, () => time, (seconds) => (time += seconds));
  };
  const voice = (sampleRate: number, body: Body | undefined, now: () => number, pass: (seconds: number) => void): Voice => ({
    sampleRate,
    get time() {
      return now();
    },
    setBody: (b) => void told.push(`body ${b.tract}`),
    aim: (pose: Partial<Pose>) => void told.push(`aim ${Object.keys(pose).join(",")}`),
    perform: (_score: Score, at?: number) => {
      performedAt = at ?? now();
      told.push("perform");
    },
    hush: () => void told.push("hush"),
    render(out) {
      out.fill(value);
      pass(out.length / sampleRate);
    },
    sense(into) {
      into[TELEMETRY.time] = now();
      into[TELEMETRY.level] = body?.folds ?? 0;
      into[TELEMETRY_SIZE - 1] = 7;
    },
  });
  return { make, told, performedAt: () => performedAt };
}

const block = () => [new Float32Array(128), new Float32Array(128)] as const;
/** Render long enough for the gains to settle (they glide over about 15 ms). */
function settle(choir: Choir, blocks = 60): readonly [Float32Array, Float32Array] {
  const [l, r] = block();
  for (let i = 0; i < blocks; i++) choir.render(l, r);
  return [l, r];
}

describe("the mixer", () => {
  test("an empty choir is silent", () => {
    const [l, r] = settle(new Choir(48000, standIn(1).make));
    expect(Math.max(...l, ...r)).toBe(0);
  });

  test("a voice in the middle reaches both ears alike, at equal power", () => {
    const choir = new Choir(48000, standIn(1).make);
    choir.add(0, { tract: 17, folds: 0.7 }, 1, 0);
    const [l, r] = settle(choir);
    expect(l[127]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(r[127]).toBeCloseTo(Math.SQRT1_2, 3);
  });

  test("a voice at the far left is in the left ear only, as loud as in the middle", () => {
    const choir = new Choir(48000, standIn(1).make);
    choir.add(0, { tract: 17, folds: 0.7 }, 0.5, -1);
    const [l, r] = settle(choir);
    expect(l[127]).toBeCloseTo(0.5, 3);
    expect(r[127]).toBeCloseTo(0, 3);
  });

  test("six voices add up, each at its own level", () => {
    const choir = new Choir(48000, standIn(0.1).make);
    for (let seat = 0; seat < SEATS; seat++) choir.add(seat, { tract: 17, folds: 0.7 }, 1, 1);
    const [l, r] = settle(choir);
    expect(r[127]).toBeCloseTo(0.6, 3);
    expect(l[127]).toBeCloseTo(0, 3);
    expect(choir.has(5)).toBe(true);
    // A seventh seat does not exist; asking for it does nothing.
    choir.add(6, { tract: 17, folds: 0.7 }, 1, 0);
    expect(choir.has(6)).toBe(false);
  });

  test("a new voice fades in and a removed one fades out, so neither clicks", () => {
    const choir = new Choir(48000, standIn(1).make);
    choir.add(0, { tract: 17, folds: 0.7 }, 1, -1);
    const [l, r] = block();
    choir.render(l, r);
    expect(l[0]).toBeLessThan(0.01);
    for (let i = 1; i < 128; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
    settle(choir);
    choir.remove(0);
    choir.render(l, r);
    expect(l[0]).toBeGreaterThan(0.9);
    for (let i = 1; i < 128; i++) expect(l[i]).toBeLessThan(l[i - 1]);
    settle(choir, 200);
    expect(choir.has(0)).toBe(false);
  });

  test("the mix does not depend on the block size", () => {
    const run = (size: number) => {
      const choir = new Choir(48000, standIn(0.5).make);
      choir.add(0, { tract: 17, folds: 0.7 }, 0.8, 0.3);
      const out: number[] = [];
      const l = new Float32Array(size);
      const r = new Float32Array(size);
      for (let done = 0; done < 1024; done += size) {
        choir.render(l, r);
        out.push(...l);
      }
      return out;
    };
    expect(run(128)).toEqual(run(1024));
    expect(run(64)).toEqual(run(1024));
  });

  test("a sample that is not a number is silenced and counted, and never reaches the output", () => {
    const choir = new Choir(48000, standIn(Number.NaN).make);
    choir.add(0, { tract: 17, folds: 0.7 }, 1, 0);
    const [l, r] = settle(choir, 2);
    expect(l.every((x) => x === 0) && r.every((x) => x === 0)).toBe(true);
    expect(choir.faults).toBe(256);
  });

  test("messages reach the voice they are for", () => {
    const { make, told, performedAt } = standIn(0);
    const choir = new Choir(48000, make);
    choir.add(2, { tract: 17, folds: 0.7 }, 1, 0);
    settle(choir, 375);
    choir.aim(2, { jaw: 1, lips: 0 });
    choir.setBody(2, { tract: 11.5, folds: 0.1 });
    choir.perform(2, { phones: [], pitch: [], length: 1 }, 0.25, 9);
    choir.hush(2);
    choir.aim(4, { jaw: 0 });
    expect(told).toEqual(["aim jaw,lips", "body 11.5", "perform", "hush"]);
    // A second into its life, asked to start a quarter of a second from now.
    expect(performedAt()).toBeCloseTo(1.25, 6);
  });
});

describe("the packet", () => {
  test("a clock survives the trip in two floats, even after hours", () => {
    const packet = new Float32Array(PACKET_SIZE);
    for (const seconds of [0, 0.0213333, 59.999, 7265.123456, 86399.987654]) {
      putClock(packet, HEAD.clock, seconds);
      expect(Math.abs(getClock(packet, HEAD.clock) - seconds)).toBeLessThan(1e-6);
    }
    putClock(packet, HEAD.clock, -1);
    expect(packet[HEAD.clock]).toBe(-1);
  });

  test("seats do not overlap and the packet holds all six", () => {
    expect(telemetryAt(0)).toBe(HEAD.size + SEAT.size);
    expect(seatAt(1)).toBe(telemetryAt(0) + TELEMETRY_SIZE);
    // The band's slots follow the six seats, and the packet ends with the last of them.
    expect(slotAt(0)).toBe(seatAt(SEATS));
    expect(instrumentAt(0)).toBe(slotAt(0) + SLOT.size);
    expect(slotAt(1)).toBe(instrumentAt(0) + INSTRUMENT_TELEMETRY_SIZE);
    expect(PACKET_SIZE).toBe(slotAt(BAND_SLOTS));
  });

  test("a report carries each voice's telemetry, clock and the start of its score", () => {
    const choir = new Choir(48000, standIn(0.25).make);
    choir.add(0, { tract: 17, folds: 0.7 }, 1, 0);
    choir.add(3, { tract: 14, folds: 0.3 }, 1, 0);
    settle(choir, 375); // one second
    choir.perform(3, { phones: [], pitch: [], length: 2 }, 0.5, 41);
    settle(choir, 375);
    const packet = new Float32Array(PACKET_SIZE);
    choir.report(packet, 123.5);

    expect(getClock(packet, HEAD.clock)).toBe(123.5);
    expect(packet[HEAD.peak]).toBeGreaterThan(0.3);
    expect(packet[HEAD.faults]).toBe(0);
    expect(packet[seatAt(0) + SEAT.alive]).toBe(1);
    expect(packet[seatAt(1) + SEAT.alive]).toBe(0);
    expect(packet[seatAt(3) + SEAT.alive]).toBe(1);
    expect(getClock(packet, seatAt(3) + SEAT.time)).toBeCloseTo(2, 6);
    expect(getClock(packet, seatAt(3) + SEAT.start)).toBeCloseTo(1.5, 6);
    expect(packet[seatAt(3) + SEAT.take]).toBe(41);
    expect(packet[seatAt(3) + SEAT.peak]).toBeCloseTo(0.25, 6);
    // The telemetry is the voice's own, whole and in its place.
    expect(packet[telemetryAt(3) + TELEMETRY.level]).toBeCloseTo(0.3, 6);
    expect(packet[telemetryAt(3) + TELEMETRY_SIZE - 1]).toBe(7);
    expect(packet[telemetryAt(0) + TELEMETRY.level]).toBeCloseTo(0.7, 6);

    expect(scoreTime(packet, 3)).toBeCloseTo(0.5, 6);
    expect(scoreTime(packet, 0)).toBe(-1);
    expect(scoreTime(packet, 1)).toBe(-1);

    // Peaks are since the last report: a second report straight after starts from nothing.
    choir.report(packet, 123.6);
    expect(packet[HEAD.peak]).toBe(0);
    // Hushing forgets the score.
    choir.hush(3);
    choir.report(packet, 123.7);
    expect(scoreTime(packet, 3)).toBe(-1);
  });
});

describe("the room", () => {
  test("is the same room every time, different in each ear", () => {
    const [l1, r1] = roomImpulse(48000);
    const [l2] = roomImpulse(48000);
    expect(l1).toEqual(l2);
    expect(l1).not.toEqual(r1);
  });

  for (const rate of [8000, 16000, 44100, 48000, 96000, 192000]) {
    test(`at ${rate} Hz: finite, the same length in seconds, the same energy, and it dies away`, () => {
      const [left, right] = roomImpulse(rate);
      for (const ear of [left, right]) {
        expect(ear.length / rate).toBeCloseTo(ROOM.gap + ROOM.decay * 1.1, 2);
        let energy = 0;
        for (const x of ear) {
          expect(Number.isFinite(x)).toBe(true);
          energy += x * x;
        }
        expect(energy).toBeCloseTo(1, 4);
        // Silence until the first wall answers.
        expect(ear.subarray(0, Math.round(ROOM.gap * rate) - 1).every((x) => x === 0)).toBe(true);
        // The last tenth is far quieter than the tenth after the early echoes.
        const tenth = Math.floor(ear.length / 10);
        const power = (from: number) => ear.subarray(from, from + tenth).reduce((sum, x) => sum + x * x, 0);
        expect(power(ear.length - tenth)).toBeLessThan(power(tenth) / 1000);
      }
    });
  }
});

describe("the WAV file", () => {
  test("has a correct header and interleaved 16-bit samples", () => {
    const wav = encodeWav([new Float32Array([0, 1, -1, 0.5]), new Float32Array([0, -1, 1, 2])], 44100);
    const view = new DataView(wav.buffer);
    const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
    expect(wav.length).toBe(44 + 4 * 2 * 2);
    expect(text(0)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(text(8)).toBe("WAVE");
    expect(text(12)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36)).toBe("data");
    expect(view.getUint32(40, true)).toBe(16);
    const samples = Array.from({ length: 8 }, (_, i) => view.getInt16(44 + 2 * i, true));
    // Left and right alternate; anything past full scale is clipped, not wrapped.
    expect(samples).toEqual([0, 0, 32767, -32767, -32767, 32767, 16384, 32767]);
  });

  test("no samples is still a valid, empty file", () => {
    expect(encodeWav([], 48000).length).toBe(44);
  });

  test("a file is named after what was performed, safely", () => {
    expect(fileName("Joyful, joyful!")).toBe("orpheon-joyful-joyful.wav");
    expect(fileName("¿Qué tal? ../../etc")).toBe("orpheon-que-tal-etc.wav");
    expect(fileName("日本語")).toBe("orpheon-voice.wav");
    expect(fileName("a".repeat(200)).length).toBeLessThanOrEqual(52);
  });

  test("a saved performance is rendered with the body and level it was heard with", () => {
    const score = { phones: [], pitch: [], length: 3 };
    const job = jobFor({
      kind: "sing",
      title: "x",
      parts: [
        { score, body: 4, level: 0.8, place: 0 },
        { score, body: 1, level: 0.4, place: -0.5 },
      ],
    });
    expect(job.parts).toEqual([
      { body: { tract: 18.4, folds: 1 }, score, level: 0.8, place: 0 },
      { body: { tract: 14.2, folds: 0.3 }, score, level: 0.4, place: -0.5 },
    ]);
    expect(job.sampleRate).toBe(48000);
  });
});
