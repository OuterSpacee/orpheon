// The sound of a video, rendered away from the page faster than real time with the same voices,
// band and mixer the live sound uses (as the WAV export is), and with it the state of every voice
// and instrument at each frame of the video, so the frames can be drawn afterwards from that.
import { INSTRUMENT_TELEMETRY_SIZE, TELEMETRY_SIZE } from "../../contract.ts";
import { createInstrument } from "../../band/index.ts";
import { createVoice } from "../../voice/index.ts";
import { Band } from "../audio/band.ts";
import { Choir } from "../audio/choir.ts";
import { PACKET_SIZE, instrumentAt, telemetryAt } from "../audio/packet.ts";
import type { FilmJob, FromFilm } from "./job.ts";

self.onmessage = (event: MessageEvent<FilmJob>) => {
  const say = (message: FromFilm, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
  try {
    const job = event.data;
    const rate = job.sampleRate;
    // Each frame is a whole number of samples (48000 / 30 or / 60), so frame k is heard from sample k × step.
    const step = Math.round(rate / job.fps);
    const choir = new Choir(rate, createVoice);
    job.parts.forEach((part, seat) => {
      choir.add(seat, part.body, part.level, part.place);
      choir.perform(seat, part.score, job.lead);
    });
    const band = new Band(rate, createInstrument);
    band.level(job.bandLevel ?? 0.8, true);
    const players = job.band ?? [];
    players.forEach((part, slot) => {
      band.add(slot, part.instrument, part.level, part.place);
      band.perform(slot, part.notes, job.lead);
    });

    const voices = job.parts.length;
    const left = new Float32Array(job.frames * step);
    const right = new Float32Array(job.frames * step);
    const telemetry = new Float32Array(job.frames * voices * TELEMETRY_SIZE);
    const instruments = new Float32Array(job.frames * players.length * INSTRUMENT_TELEMETRY_SIZE);
    const packet = new Float32Array(PACKET_SIZE);
    const blockLeft = new Float32Array(step);
    const blockRight = new Float32Array(step);
    for (let k = 0; k < job.frames; k++) {
      // What the body is doing as frame k is shown: before its samples are made.
      choir.report(packet, k / job.fps);
      band.report(packet);
      for (let v = 0; v < voices; v++) telemetry.set(packet.subarray(telemetryAt(v), telemetryAt(v) + TELEMETRY_SIZE), (k * voices + v) * TELEMETRY_SIZE);
      for (let p = 0; p < players.length; p++)
        instruments.set(packet.subarray(instrumentAt(p), instrumentAt(p) + INSTRUMENT_TELEMETRY_SIZE), (k * players.length + p) * INSTRUMENT_TELEMETRY_SIZE);
      choir.render(blockLeft, blockRight);
      band.render(blockLeft, blockRight);
      left.set(blockLeft, k * step);
      right.set(blockRight, k * step);
      if (k % 30 === 0) say({ type: "progress", done: k / job.frames });
    }
    if (choir.faults) throw new Error("the voice produced samples that were not numbers");
    if (band.faults) throw new Error("an instrument produced samples that were not numbers");
    say({ type: "done", left, right, telemetry, instruments }, [left.buffer, right.buffer, telemetry.buffer, instruments.buffer]);
  } catch (error) {
    say({ type: "failed", why: error instanceof Error ? error.message : String(error) });
  }
};
