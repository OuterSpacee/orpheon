// A WAV file from samples: 16-bit PCM, the plainest kind, which everything opens.

/** Interleave the channels and wrap them in a RIFF/WAVE header. Samples outside -1..1 are clipped. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // size of the format chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); // bytes a second
  view.setUint16(32, count * 2, true); // bytes a frame
  view.setUint16(34, 16, true); // bits a sample
  text(36, "data");
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(at, Math.round(x * 32767), true);
      at += 2;
    }
  }
  return new Uint8Array(buffer);
}
