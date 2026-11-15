// Recording in real time: the frame as it is drawn on the screen, at its full size, with the sound
// as it is heard, through the browser's own MediaRecorder. It works for anything the page does
// live (Touch, an instrument played on the keys) because it records what happens, not a plan.

/** The kinds of file the browser may record, best first. */
const KINDS = [
  { mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", extension: "mp4" },
  { mime: "video/mp4", extension: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", extension: "webm" },
  { mime: "video/webm;codecs=vp8,opus", extension: "webm" },
  { mime: "video/webm", extension: "webm" },
];

export interface Take {
  /** Seconds recorded so far. */
  seconds(): number;
  stop(): Promise<{ file: Blob; extension: string }>;
}

export function recordLive(picture: HTMLCanvasElement, sound: MediaStream | null, fps: number, bitrate: number): Take {
  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record the page.");
  const stream = picture.captureStream(fps);
  for (const track of sound?.getAudioTracks() ?? []) stream.addTrack(track);
  const kind = KINDS.find((k) => MediaRecorder.isTypeSupported(k.mime)) ?? { mime: "", extension: "webm" };
  const recorder = new MediaRecorder(stream, { ...(kind.mime ? { mimeType: kind.mime } : {}), videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 });
  const pieces: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && pieces.push(event.data);
  const began = performance.now();
  recorder.start(1000);
  return {
    seconds: () => (performance.now() - began) / 1000,
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = () => {
          // The picture's track is ours to end; the sound's belongs to the page and goes on.
          stream.getVideoTracks().forEach((t) => t.stop());
          resolve({ file: new Blob(pieces, { type: recorder.mimeType || kind.mime || "video/webm" }), extension: kind.extension });
        };
        recorder.onerror = () => reject(new Error("the recording failed"));
        if (recorder.state === "inactive") recorder.onstop(new Event("stop"));
        else recorder.stop();
      }),
  };
}
