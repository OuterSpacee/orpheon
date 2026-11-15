// What every sound passes through on its way out: a small room, a gentle limiter, the volume.
// Built the same way for the live context and for the offline one that makes a WAV.
import { roomImpulse } from "./room.ts";

export interface Chain {
  /** Connect the voices here. */
  input: AudioNode;
  /** Connect this to the destination. */
  output: AudioNode;
  /** 0 a dry voice to 1 a voice far away in the room. */
  setRoom(amount: number): void;
  /** 0 silent to 1 full. */
  setVolume(amount: number): void;
}

/** Gain into the room and limiter, set by ear and by the meter: speech then leaves near -8 dB. */
const DRIVE = 1.5;

export function buildChain(ctx: BaseAudioContext, room: number, volume: number): Chain {
  const input = ctx.createGain();
  // The voices arrive quiet (speech peaks near 0.3); lift them toward the limiter's knee.
  input.gain.value = DRIVE;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const master = ctx.createGain();

  const hall = ctx.createConvolver();
  hall.normalize = false; // the impulse is already scaled to pass as much energy as it is given
  const [left, right] = roomImpulse(ctx.sampleRate);
  const impulse = ctx.createBuffer(2, left.length, ctx.sampleRate);
  impulse.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
  impulse.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
  hall.buffer = impulse;

  // A limiter that only leans on the loudest moments: a wide knee, a quick attack, a slow let-go.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 10;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  // The compressor node adds make-up gain of its own; leave a little room above it.
  const trim = ctx.createGain();
  trim.gain.value = 0.9;

  input.connect(dry).connect(limiter);
  input.connect(hall).connect(wet).connect(limiter);
  limiter.connect(trim).connect(master);

  const roomGain = (amount: number) => 0.7 * Math.min(1, Math.max(0, amount));
  // Loudness is heard on a curve; squaring makes the middle of the slider sound like half.
  const volumeGain = (amount: number) => Math.min(1, Math.max(0, amount)) ** 2;
  wet.gain.value = roomGain(room);
  master.gain.value = volumeGain(volume);

  return {
    input,
    output: master,
    setRoom: (amount) => wet.gain.setTargetAtTime(roomGain(amount), ctx.currentTime, 0.03),
    setVolume: (amount) => master.gain.setTargetAtTime(volumeGain(amount), ctx.currentTime, 0.03),
  };
}
