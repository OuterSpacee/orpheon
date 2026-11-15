// Hand-written phones to a Score, and a Score to samples: what tools/render.ts, the judge and the
// voice's tests share.
//
// A line of phones is IPA symbols from PHONES separated by spaces:
//   h ə ˈl oː ʊ       ˈ before a phone gives it primary stress, ˌ secondary
//   s:0.2             a length in seconds after a colon; otherwise each sound gets a usual length
//   aː                ː makes a vowel half as long again
//   _                 a rest; | a word boundary (ignored by the voice, kept for captions)
import { BODIES, PHONES } from "../src/contract.ts";
import type { Body, Phone, PhoneSymbol, Score } from "../src/contract.ts";
import { createVoice } from "../src/voice/index.ts";
import { soundOf } from "../src/voice/phones.ts";

const SYMBOLS = new Set<string>(PHONES);

/** A usual length for a sound in plain speech, seconds. */
function usual(ph: PhoneSymbol, stress: number, body: Body): number {
  const manner = soundOf(ph, body).manner;
  if (manner === "vowel") return ph === "ə" || ph === "ɪ" || ph === "ʊ" ? (stress ? 0.1 : 0.07) : stress ? 0.16 : 0.11;
  if (manner === "rest") return 0.25;
  if (manner === "stop") return 0.09;
  if (manner === "affricate") return 0.13;
  if (manner === "fricative") return soundOf(ph, body).voiced ? 0.08 : 0.11;
  if (manner === "tap") return 0.035;
  return 0.075;
}

export interface Spoken {
  /** Speaking pitch in Hz, or a tune as [seconds, Hz] pairs. */
  pitch?: number | [number, number][];
  /** Stretch every usual length by this. */
  slow?: number;
  body?: Body;
}

/** Phones written by hand to a Score. Leaves a quarter second of rest before and after. */
export function scoreOf(line: string, options: Spoken = {}): Score {
  const body = options.body ?? BODIES.tenor;
  const slow = options.slow ?? 1;
  const phones: Phone[] = [];
  let t = 0.25;
  for (const word of line.trim().split(/\s+/)) {
    if (word === "|") continue;
    let [name, length] = word.split(":");
    let stress: 0 | 1 | 2 | undefined;
    if (name.startsWith("ˈ")) [stress, name] = [1, name.slice(1)];
    else if (name.startsWith("ˌ")) [stress, name] = [2, name.slice(1)];
    const long = name.endsWith("ː");
    if (long) name = name.slice(0, -1);
    if (!SYMBOLS.has(name)) throw new Error(`"${name}" is not in PHONES`);
    const ph = name as PhoneSymbol;
    const d = length ? Number(length) : usual(ph, stress ?? 0, body) * (long ? 1.5 : 1) * slow;
    if (ph !== "_") phones.push(stress === undefined ? { ph, t, d } : { ph, t, d, stress });
    t += d;
  }
  const length = t + 0.25;
  const hz = options.pitch ?? 250 - 140 * body.folds;
  // Spoken with no tune: start a little high and fall, as a statement does.
  const pitch = typeof hz === "number"
    ? [{ t: 0, v: hz * 1.08 }, { t: length * 0.6, v: hz * 0.97 }, { t: length, v: hz * 0.8 }]
    : hz.map(([at, v]) => ({ t: at, v }));
  return { phones, pitch, length };
}

/** Perform a score from silence and return the sound. `tail` seconds are rendered past its end. */
export function renderScore(score: Score, body: Body = BODIES.tenor, rate = 48000, tail = 0.2): Float32Array {
  const voice = createVoice(rate, body);
  voice.perform(score, 0);
  const out = new Float32Array(Math.ceil((score.length + tail) * rate));
  for (let at = 0; at < out.length; at += 4096) voice.render(out.subarray(at, Math.min(out.length, at + 4096)));
  return out;
}
