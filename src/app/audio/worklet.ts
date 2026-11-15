// The audio thread: hosts the voices and the band, mixes them, and posts a packet of telemetry
// about sixty times a second. Everything here runs inside the AudioWorklet; see messages.ts and
// packet.ts.
import { createInstrument } from "../../band/index.ts";
import { createVoice } from "../../voice/index.ts";
import { Band } from "./band.ts";
import { Choir } from "./choir.ts";
import type { ToVoices } from "./messages.ts";
import { HEAD, PACKET_SIZE } from "./packet.ts";

// The worklet's own globals, which TypeScript's DOM library does not describe.
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** Packets in circulation. If the page is slow to send them back, a frame is skipped, not allocated. */
const POOL = 4;

class OrpheonVoices extends AudioWorkletProcessor {
  private readonly choir = new Choir(sampleRate, createVoice);
  private readonly band = new Band(sampleRate, createInstrument);
  private readonly pool: Float32Array[] = [];
  private free = 0;
  private readonly handover: ArrayBuffer[] = [];
  private untilPacket = 0;
  /** Used when the host gives a mono output: the right ear still has to be written somewhere. */
  private spare = new Float32Array(128);

  constructor() {
    super();
    for (let i = 0; i < POOL; i++) this.pool.push(new Float32Array(PACKET_SIZE));
    this.free = POOL;
    this.port.onmessage = (event: MessageEvent<ToVoices | Float32Array>) => this.hear(event.data);
  }

  private hear(m: ToVoices | Float32Array): void {
    if (m instanceof Float32Array) {
      if (this.free < POOL && m.length === PACKET_SIZE) this.pool[this.free++] = m;
      return;
    }
    const choir = this.choir;
    const band = this.band;
    switch (m.type) {
      case "add":
        return choir.add(m.seat, m.body, m.level, m.place);
      case "remove":
        return choir.remove(m.seat);
      case "body":
        return choir.setBody(m.seat, m.body);
      case "mix":
        return choir.mix(m.seat, m.level, m.place);
      case "aim":
        return choir.aim(m.seat, m.pose);
      case "perform":
        return choir.perform(m.seat, m.score, m.when - currentTime, m.take);
      case "hush":
        return choir.hush(m.seat);
      case "instrument":
        return band.add(m.slot, m.id, m.level, m.place);
      case "unseat":
        return band.remove(m.slot);
      case "bandmix":
        return band.mix(m.slot, m.level, m.place);
      case "play":
        // The same delay a voice's "perform" with this `when` gets: they start on one sample.
        return band.perform(m.slot, m.notes, m.when - currentTime);
      case "strike":
        return band.strike(m.slot, m.midi, m.velocity);
      case "bandhush":
        return band.hush(m.slot);
      case "bandlevel":
        return band.level(m.level);
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const left = out[0];
    if (!left) return true;
    let right = out[1];
    if (!right) {
      if (this.spare.length !== left.length) this.spare = new Float32Array(left.length);
      right = this.spare;
    }
    this.choir.render(left, right);
    this.band.render(left, right);

    this.untilPacket -= left.length;
    if (this.untilPacket <= 0) {
      this.untilPacket += sampleRate / 60;
      if (this.free > 0) {
        const packet = this.pool[--this.free];
        this.choir.report(packet, currentTime + left.length / sampleRate);
        packet[HEAD.peak] = Math.max(packet[HEAD.peak], this.band.peak);
        packet[HEAD.faults] += this.band.faults;
        this.band.report(packet);
        this.handover[0] = packet.buffer as ArrayBuffer;
        this.port.postMessage(packet, this.handover);
      }
    }
    return true;
  }
}

registerProcessor("orpheon-voices", OrpheonVoices);
