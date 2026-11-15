// Asking the AI arranger about an imported file (src/ai/arranger.ts says what is asked and how
// the answer is checked; a server route, POST /api/arrange, asks the model: switched off for now,
// see ARRANGER_ONLINE). The page arranges the file on its own
// at once; the advice, when it comes, steers that arrangement: the band, the staging's leanings,
// the song's name, and words for a public-domain song that came without any. No answer (offline,
// the dev server, the day's allowance spent, a slow model) just leaves the page's own arrangement.
import { briefText, type Advice, type Brief } from "../../ai/arranger.ts";
import { analyse } from "../../lang/arrange.ts";
import { form, lines as stageLines } from "../../lang/staging.ts";
import type { Tune } from "../songs.ts";
import { meterOf } from "./plan.ts";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/** What the page tells the arranger about an imported tune: the file's own words and names, and what the page heard. */
export function briefOf(tune: Tune, file: string): Brief {
  const source = tune.source;
  const hint = meterOf(source);
  const a = analyse(tune.notes, hint);
  const bar = a.beat * a.meter;
  const units = stageLines(tune.notes, a.phrases, 4 * bar + 1e-3, 2 * bar - 1e-3);
  const sig = source?.song.timeSignatures?.[0];
  return {
    file,
    title: source?.title ?? tune.title,
    tracks: (source?.tracks ?? []).filter((t) => t.notes > 0).map((t) => `${t.name || `Track ${t.index + 1}`}${t.drums ? " (drums)" : t.program !== null ? ` (program ${t.program})` : ""}`).slice(0, 16),
    texts: [],
    words: tune.lyrics.replace(/\s+/g, " ").slice(0, 600),
    key: a.keyName,
    meter: sig ? `${sig.numerator}/${sig.denominator}` : `${a.meter} beats a bar`,
    tempo: a.tempo,
    form: form(tune.notes, units).join(" "),
    tune: tune.notes
      .slice(0, 48)
      .map((n) => `${noteName(n.midi)}:${Math.round((n.d / a.beat) * 4) / 4}`)
      .join(" "),
    kind: a.character,
  };
}

/**
 * Whether the page offers the AI arranger. Off since 2026-11-16: the site is public and static,
 * with no server to ask the model (the server half was worker/index.ts, in the history up to
 * 21dc8da). The page arranges every file itself, as it always has; to bring the arranger back,
 * serve POST /api/arrange again and set this true.
 */
export const ARRANGER_ONLINE = false;

/** Advice for a brief, or null (no arranger here, or it could not answer in time). */
export async function askArranger(brief: Brief, signal?: AbortSignal): Promise<{ advice: Advice | null; why: string }> {
  try {
    const timeout = AbortSignal.timeout(30_000);
    const reply = await fetch("/api/arrange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body = (await reply.json().catch(() => null)) as { advice?: Advice; error?: string } | null;
    if (reply.ok && body?.advice) return { advice: body.advice, why: "" };
    return { advice: null, why: body?.error ?? `The arranger answered ${reply.status}.` };
  } catch (error) {
    return { advice: null, why: error instanceof Error && error.name === "AbortError" ? "" : "The arranger could not be reached." };
  }
}

/**
 * Do words fit a tune of `notes` notes? A syllable for each note, give or take: the model's
 * memory of a song's words can be wrong (it gave Adeste fideles a short Latin verse it made up),
 * and words a fifth short or a quarter long of the tune are not this song's.
 */
export function wordsFit(text: string, notes: number): boolean {
  const syllables = text
    .split(/\s+/)
    .flatMap((word) => word.split("-"))
    .filter((piece) => /\p{L}/u.test(piece)).length;
  return notes > 0 && syllables >= 0.8 * notes && syllables <= 1.25 * notes;
}

/** What the advice did, in a sentence or two for the person. */
export function adviceSays(a: Advice, hadWords: boolean, gaveWords: boolean, refused = false): string {
  const name = a.song.known && a.song.title ? `“${a.song.title}”` : "this song";
  const about = [a.song.origin, a.mood].filter(Boolean).join("; ");
  const band = a.band.join(", ");
  const words = hadWords
    ? ""
    : refused
      ? " It offered words, but they do not fit this tune's notes, so they were left out: add them under Words."
      : gaveWords
      ? " Its words were added from the arranger's memory of this public-domain song: check them under Words."
      : a.song.known && !a.song.publicDomain
        ? " Its words may still be under copyright, so none were added: paste them under Words if you have the right to."
        : " The file has no words, so it is sung on “la” unless you add some under Words.";
  return `The arranger heard ${name}${about ? ` (${about})` : ""} and chose ${band}.${words}`;
}

export { briefText };
