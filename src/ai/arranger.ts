// The AI arranger's half of the conversation, shared by the page (which writes the brief and
// takes the advice) and the worker (which asks the model and checks the answer). No DOM, no I/O.
//
// The page sends a brief: what the file says of itself (title, track names, its text events, its
// words if it has any) and what Orpheon's own analysis heard (key, meter, tempo, form, the tune's
// first notes). The model answers with advice: what the song is, its mood, the band, the shape
// of the arrangement, and, only for a song in the public domain, its words. Every field is checked
// here before anything uses it; the page's own arranger and critic still write and judge every
// note, so advice can only steer, never break, an arrangement.
import { INSTRUMENTS, type InstrumentId } from "../contract.ts";

/** The Workers AI model: multilingual, cheap (about 70 neurons a brief), on the free plan. */
export const MODEL = "@cf/google/gemma-4-26b-a4b-it";

/** The languages Orpheon can sing words in. */
export const SINGABLE = ["en", "es", "it", "la", "ja"] as const;
export type Singable = (typeof SINGABLE)[number];

export interface Brief {
  /** The file's name and the title it gives itself. */
  file: string;
  title: string;
  /** The names of its tracks, and its text events (copyright lines, credits, markers), a few. */
  tracks: string[];
  texts: string[];
  /** Its words, if it has any (the start of them). */
  words: string;
  /** What Orpheon heard. */
  key: string;
  meter: string;
  tempo: number;
  form: string;
  /** The tune's first notes, "C4:1 D4:0.5 ...", beats after the colon. */
  tune: string;
  kind: string;
}

export interface Advice {
  song: {
    title: string;
    /** Is it a song the model recognises (not a guess from the title alone)? */
    known: boolean;
    /** Who made it and when, in a few words ("traditional English, 16th century"). */
    origin: string;
    language: Singable | "other";
    /** Free to sing and print: traditional, or its words' author dead long enough, or published before 1930. */
    publicDomain: boolean;
  };
  /** Its mood in a few words, for the page to say. */
  mood: string;
  band: InstrumentId[];
  plan: {
    fullAt: 0.35 | 0.45 | 0.55;
    breather: "men-women" | "women-men" | "none";
    hum: boolean;
    first: "alto" | "tenor" | "bass";
  };
  /** The words, only for a public-domain song that has none in the file: a line to each phrase, syllables parted with "-". */
  words: { text: string; language: Singable } | null;
  /** One sentence: why this band and this shape. */
  why: string;
}

const ids = INSTRUMENTS.map((i) => i.id) as InstrumentId[];

/** What the model is told: its job, Orpheon's instruments, the rules for words, and the answer's shape. */
export const SYSTEM = [
  "You are the arranger for Orpheon, a virtual choir (soprano, alto, tenor, bass) with a small band.",
  "You get a brief about a song read from a MIDI file. Decide how to stage it, the way a choral arranger would.",
  "",
  "Instruments you may use (choose 2 to 5 that suit the song's style, culture and mood; a drone set for South Asian music, a rhythm section for pop, strings and timpani for an anthem, harp and flute for something gentle):",
  ...INSTRUMENTS.map((i) => `- ${i.id}: ${i.does}`),
  "",
  "Plan:",
  "- fullAt: how far in the whole choir sings: 0.35 early, 0.45 middle, 0.55 late (a slow build).",
  "- breather: in a long song, a lighter middle passage: \"men-women\" (the men take a phrase, the women answer), \"women-men\", or \"none\".",
  "- hum: true if the joining voices should hum under the tune while the choir builds (slow, tender songs), false to sing the words (lively songs).",
  "- first: which voice joins the tune first: \"alto\" (a sweet duet), \"tenor\", or \"bass\" (a foundation first).",
  "",
  "Words: you have no internet. Only if the song is in the public domain (traditional, or written before 1930, or its lyricist died over 70 years ago) AND the brief has no words AND you know the words with certainty, give them: one line per sung phrase, syllables of words longer than one syllable parted with '-', in one of these languages: en, es, it, la, ja. Otherwise words must be null. Never give words of a song that may still be under copyright, and never invent words.",
  "",
  "Answer with one JSON object and nothing else:",
  '{"song":{"title":string,"known":boolean,"origin":string,"language":"en"|"es"|"it"|"la"|"ja"|"other","publicDomain":boolean},"mood":string,"band":[instrument ids],"plan":{"fullAt":0.35|0.45|0.55,"breather":"men-women"|"women-men"|"none","hum":boolean,"first":"alto"|"tenor"|"bass"},"words":null|{"text":string,"language":"en"|"es"|"it"|"la"|"ja"},"why":string}',
].join("\n");

/** The brief as the model reads it. */
export function briefText(b: Brief): string {
  return [
    `File: ${b.file}`,
    `Title in the file: ${b.title || "(none)"}`,
    `Tracks: ${b.tracks.join("; ") || "(unnamed)"}`,
    b.texts.length ? `Text in the file: ${b.texts.join(" | ")}` : "",
    `Words in the file: ${b.words ? b.words : "(none)"}`,
    `Heard: ${b.key}, ${b.meter}, about ${Math.round(b.tempo)} beats a minute, form ${b.form}, character "${b.kind}"`,
    `Tune begins: ${b.tune}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A string, cut at a sentence's end if it runs over `most`. */
const text = (x: unknown, most: number): string => {
  if (typeof x !== "string") return "";
  const s = x.replace(/\s+/g, " ").trim();
  if (s.length <= most) return s;
  const cut = s.slice(0, most);
  const end = cut.lastIndexOf(". ");
  return end > most / 2 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
};
const oneOf = <T extends string | number>(x: unknown, options: readonly T[], fallback: T): T => (options.includes(x as T) ? (x as T) : fallback);

/** The first JSON object in a reply, whether it came bare, fenced in ``` or after a sentence. */
export function jsonIn(reply: unknown): unknown {
  if (reply && typeof reply === "object") return reply;
  if (typeof reply !== "string") return null;
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The advice in a reply, every field checked: unknown instruments dropped, choices held to the
 * ones offered, words only for a song the model calls public domain and in a language Orpheon
 * sings. Null when there is nothing usable (no band at all).
 */
export function checkAdvice(reply: unknown): Advice | null {
  const raw = jsonIn(reply) as Record<string, any> | null;
  if (!raw || typeof raw !== "object") return null;
  const song = (raw.song ?? {}) as Record<string, unknown>;
  const plan = (raw.plan ?? {}) as Record<string, unknown>;
  const band = [...new Set((Array.isArray(raw.band) ? raw.band : []).filter((x: unknown): x is InstrumentId => ids.includes(x as InstrumentId)))].slice(0, 5);
  if (!band.length) return null;
  const publicDomain = song.publicDomain === true;
  const known = song.known === true;
  let words: Advice["words"] = null;
  const w = raw.words as Record<string, unknown> | null;
  if (publicDomain && known && w && typeof w === "object") {
    const lyric = typeof w.text === "string" ? w.text.trim().slice(0, 4000) : "";
    const language = oneOf(w.language, SINGABLE, "en");
    if (lyric.split(/\s+/).length >= 4) words = { text: lyric, language };
  }
  return {
    song: {
      title: text(song.title, 120),
      known,
      origin: text(song.origin, 160),
      language: oneOf(song.language, [...SINGABLE, "other"] as const, "other"),
      publicDomain,
    },
    mood: text(raw.mood, 80),
    band,
    plan: {
      fullAt: oneOf(Number(plan.fullAt), [0.35, 0.45, 0.55] as const, 0.45),
      breather: oneOf(plan.breather, ["men-women", "women-men", "none"] as const, "men-women"),
      hum: plan.hum === true,
      first: oneOf(plan.first, ["alto", "tenor", "bass"] as const, "alto"),
    },
    words,
    why: text(raw.why, 300),
  };
}
