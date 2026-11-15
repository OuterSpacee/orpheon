// What tools/voice-story.ts and tools/voice-pairs.ts share with the judge: Whisper as the
// listener (tools/voice-judge.py, offline), and the judge's way of counting words.
import { wav } from "../tests/voice/measure.ts";

/** Write each sound as a 16 kHz WAV (an item with no sound is a WAV already there) and ask Whisper what it hears in each, in order. */
export async function listen(items: { file: string; sound?: Float32Array }[], model = "small.en", dir = "out/listen-judge"): Promise<string[]> {
  for (const item of items) if (item.sound) await Bun.write(item.file, wav(item.sound, 16000));
  const manifest = `${dir}/manifest.json`;
  await Bun.write(manifest, JSON.stringify(items.map((i) => ({ file: i.file }))));
  const python = Bun.spawnSync(["python", "tools/voice-judge.py", manifest, model], {
    env: { ...process.env, HF_HUB_OFFLINE: "1", PYTHONIOENCODING: "utf-8" },
    stderr: "pipe",
  });
  if (python.exitCode !== 0) throw new Error(python.stderr.toString());
  return python.stdout.toString().trim().split("\n").map((row) => (JSON.parse(row) as { heard: string }).heard);
}

const NUMBERS: Record<string, string> = { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };

/** Lower case words, hyphens split, punctuation gone, small numbers spelled. */
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => NUMBERS[w] ?? w);

/** How many of `want` come back in `got`, in order (the longest common subsequence), as the judge counts. */
export function understood(want: readonly string[], got: readonly string[]): number {
  const row = new Array(got.length + 1).fill(0);
  for (const w of want) {
    let diagonal = 0;
    for (let j = 1; j <= got.length; j++) {
      const up = row[j];
      row[j] = w === got[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = up;
    }
  }
  return row[got.length];
}
