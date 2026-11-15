// What the caption shows at one instant of a score: the word being voiced and the sounds that
// make it up, with the one being made now marked. No DOM here.
import type { PhoneSymbol, Score } from "../contract.ts";

export interface Caption {
  word: string;
  phones: PhoneSymbol[];
  /** Which of `phones` is sounding now, or -1. */
  now: number;
}

const NOTHING: Caption = { word: "", phones: [], now: -1 };

/** How long a word stays up after its last sound, so it does not flicker out between words. */
const LINGER = 0.18;
/** Sounds shown on each side of the present one when the score has no words to group them by. */
const AROUND = 3;

/**
 * `position` is seconds into the score on the voice's clock; `phone` is the index the voice
 * reports in its telemetry (TELEMETRY.phone), or -1.
 */
export function captionAt(score: Score, position: number, phone: number): Caption {
  if (position < 0 || position > score.length + LINGER) return NOTHING;
  const sounding = (from: number, to: number) => {
    const phones: PhoneSymbol[] = [];
    let now = -1;
    score.phones.forEach((p, i) => {
      if (p.ph === "_" || p.t < from || p.t >= to) return;
      if (i === phone) now = phones.length;
      phones.push(p.ph);
    });
    return { phones, now };
  };

  const words = score.words ?? [];
  if (!words.length) {
    // No words: show the run of sounds around the present one.
    const at = phone >= 0 ? phone : score.phones.findIndex((p) => position < p.t + p.d);
    if (at < 0) return NOTHING;
    const first = Math.max(0, at - AROUND);
    const run = score.phones.slice(first, at + AROUND + 1);
    const phones = run.filter((p) => p.ph !== "_").map((p) => p.ph);
    const now = score.phones[at].ph === "_" ? -1 : run.slice(0, at - first).filter((p) => p.ph !== "_").length;
    return { word: "", phones, now: phone >= 0 ? now : -1 };
  }

  const starts = wordStarts(score);
  let current = -1;
  for (let i = 0; i < words.length; i++) {
    if (position >= starts[i]) current = i;
  }
  if (current < 0) return NOTHING;
  const word = words[current];
  const next = words[current + 1];
  // Past the word's end, it lingers a moment unless the next word is due.
  if (position > word.t + word.d + LINGER && (!next || position < starts[current + 1])) return NOTHING;
  return { word: word.text, ...sounding(starts[current] - 0.005, (next ? starts[current + 1] : Infinity) - 0.005) };
}

const startsOf = new WeakMap<Score, number[]>();

/**
 * When each word's first sound begins. A word's own time is when it is heard to start (its
 * first vowel, in a sung word), so the consonants in front of it begin earlier: they are the
 * sounds between the end of the word before and the word's own time.
 */
function wordStarts(score: Score): number[] {
  const known = startsOf.get(score);
  if (known) return known;
  const words = score.words ?? [];
  const starts: number[] = [];
  let k = 0;
  words.forEach((word, i) => {
    const after = i ? words[i - 1].t + words[i - 1].d - 0.005 : -Infinity;
    while (k < score.phones.length && (score.phones[k].t < after || score.phones[k].ph === "_")) k++;
    const first = score.phones[k];
    starts.push(first && first.t < word.t ? first.t : word.t);
  });
  startsOf.set(score, starts);
  return starts;
}

/**
 * Which phone a score is in at `position`, by the clock alone: -1 in a gap or outside the score.
 * The voice's own report (TELEMETRY.phone) is better, because it knows what it is really doing;
 * this stands in when the voice reports nothing.
 */
export function phoneAt(score: Score, position: number): number {
  return score.phones.findIndex((p) => position >= p.t && position < p.t + p.d);
}

/** 73.4 seconds as "1:13". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
