// The share link: the mode, the text, the song and the body, the song's choir and band, and the
// Instrument mode's sound, carried after the "#" of the page's address. Only what differs from a fresh page is written, so most links are short. Whatever
// arrives is checked before it is believed: a link is something a stranger typed.
import { INSTRUMENTS } from "../contract.ts";
import type { InstrumentId } from "../contract.ts";
import type { Lang } from "../lang/index.ts";
import { BODY_MAX, BODY_NAMES } from "./bodies.ts";
import { PRESETS, TONE_RANGE, presetById } from "./instrument/presets.ts";
import type { Tone } from "./instrument/presets.ts";
import { STYLES, defaultSetup, setupOf } from "./sing/setup.ts";
import type { SongSetup, Style } from "./sing/setup.ts";
import { clamp } from "./notes.ts";
import { SONGS } from "./songs.ts";
import { INITIAL, LANGS, MODES } from "./state.ts";
import type { Mode, State } from "./state.ts";

/** The part of the state a link carries. */
export type Shared = Pick<
  State,
  "mode" | "body" | "text" | "lang" | "pace" | "pitch" | "lively" | "song" | "lyrics" | "transpose" | "tempo" | "shimmer" | "setups" | "bandLevel" | "singAs" | "preset" | "tone"
>;

/** The keys of the state a link carries: when one changes, the address is written again. */
export const SHARED_KEYS = [
  "mode", "body", "text", "lang", "pace", "pitch", "lively", "song", "lyrics", "transpose", "tempo", "shimmer", "setups", "bandLevel", "singAs", "preset", "tone",
] as const satisfies readonly (keyof Shared)[];

/** The Instrument mode's tone in a link: the name each value goes by. */
const TONE_KEYS: Record<keyof Tone, string> = {
  unison: "unison", detune: "detune", spread: "spread", x: "vx", y: "vy", noise: "breath",
  vibrato: "wobble", attack: "attack", release: "release", octave: "octave", size: "size",
};

/** Digits a tone value is written with: as fine as its control steps. */
const digitsOf = (key: keyof Tone): number => {
  const step = TONE_RANGE[key][2];
  return step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
};

/** Longer texts are cut: an address much past 2000 characters stops working in places. */
export const TEXT_LIMIT = 1200;

/** Each number a link may carry: its name in the link, its range, and how finely it is written. */
const NUMBERS = {
  pace: { key: "pace", low: 0.5, high: 2, digits: 2 },
  pitch: { key: "pitch", low: -12, high: 12, digits: 1 },
  lively: { key: "lively", low: 0, high: 1, digits: 2 },
  transpose: { key: "transpose", low: -12, high: 12, digits: 0 },
  tempo: { key: "tempo", low: 0.5, high: 2, digits: 2 },
  shimmer: { key: "vibrato", low: 0, high: 80, digits: 0 },
} as const;

const round = (x: number, digits: number) => Number(x.toFixed(digits));

export function encodeLink(s: Shared): string {
  const q = new URLSearchParams();
  q.set("mode", s.mode);
  if (s.body !== INITIAL.body) q.set("body", Number.isInteger(s.body) ? BODY_NAMES[s.body] : String(round(s.body, 2)));
  if (s.mode === "speak") {
    if (s.text) q.set("text", s.text.slice(0, TEXT_LIMIT));
    if (s.lang !== INITIAL.lang) q.set("lang", s.lang);
  }
  // An imported song lives only in this browser; a link cannot carry it.
  if (s.mode === "sing" && SONGS.some((song) => song.id === s.song)) {
    q.set("song", s.song);
    if (s.lyrics !== null) q.set("words", s.lyrics.slice(0, TEXT_LIMIT));
    // The song's choir and band, where they differ from how the song starts.
    const setup = setupOf(s);
    const fresh = defaultSetup(s.song);
    if (setup.choir !== fresh.choir) q.set("choir", setup.choir ? "1" : "0");
    if (setup.choir && setup.voices !== fresh.voices) q.set("voices", String(setup.voices));
    if (setup.choir && setup.style !== fresh.style) q.set("style", setup.style);
    if (setup.choir && setup.style === "staged" && setup.variant) q.set("plan", String(setup.variant));
    // the band where it differs from how the song starts (a song with its own band starts with it on)
    if (setup.band !== fresh.band || (setup.band && setup.instruments !== null)) {
      q.set("band", !setup.band ? "off" : setup.instruments === null ? "suggested" : setup.instruments.join("."));
    }
    if (setup.band && round(s.bandLevel, 2) !== INITIAL.bandLevel) q.set("bandlevel", String(round(s.bandLevel, 2)));
    if (s.singAs !== INITIAL.singAs) q.set("as", s.singAs);
  }
  if (s.mode === "instrument") {
    q.set("preset", s.preset);
    const own = presetById(s.preset).tone;
    for (const key in TONE_KEYS) {
      const k = key as keyof Tone;
      const value = round(s.tone[k], digitsOf(k));
      if (value !== round(own[k], digitsOf(k))) q.set(TONE_KEYS[k], String(value));
    }
  }
  const mine: (keyof typeof NUMBERS)[] = s.mode === "speak" ? ["pace", "pitch", "lively"] : s.mode === "sing" ? ["transpose", "tempo", "shimmer"] : [];
  for (const name of mine) {
    const n = NUMBERS[name];
    if (round(s[name], n.digits) !== INITIAL[name]) q.set(n.key, String(round(s[name], n.digits)));
  }
  return q.toString();
}

/** Read a link's fragment (with or without its "#"). Anything missing or wrong is simply left out. */
export function decodeLink(fragment: string): Partial<Shared> {
  const q = new URLSearchParams(fragment.replace(/^#/, ""));
  const out: Partial<Shared> = {};

  const mode = q.get("mode");
  if (MODES.some((m) => m.id === mode)) out.mode = mode as Mode;

  const body = q.get("body");
  if (body !== null) {
    const named = BODY_NAMES.indexOf(body as (typeof BODY_NAMES)[number]);
    const value = named >= 0 ? named : Number(body);
    if (body !== "" && Number.isFinite(value)) out.body = clamp(value, 0, BODY_MAX);
  }

  const text = q.get("text");
  if (text) out.text = text.slice(0, TEXT_LIMIT);

  const lang = q.get("lang");
  if (lang !== null && lang in LANGS) out.lang = lang as Lang;

  const song = q.get("song");
  if (SONGS.some((s) => s.id === song)) {
    out.song = song!;
    const words = q.get("words");
    if (words !== null) out.lyrics = words.slice(0, TEXT_LIMIT);
    const setup: Partial<SongSetup> = {};
    const choir = q.get("choir");
    if (choir === "1" || choir === "0") setup.choir = choir === "1";
    const voices = Number(q.get("voices"));
    if (q.get("voices") && Number.isFinite(voices)) setup.voices = clamp(Math.round(voices), 2, 6);
    const style = q.get("style");
    if (STYLES.some((x) => x.id === style)) setup.style = style as Style;
    const plan = Number(q.get("plan"));
    if (q.get("plan") && Number.isFinite(plan) && plan > 0) setup.variant = Math.min(99, Math.round(plan));
    const band = q.get("band");
    if (band === "off") setup.band = false;
    else if (band !== null) {
      setup.band = true;
      setup.instruments = band === "suggested" ? null : band.split(".").filter((id): id is InstrumentId => INSTRUMENTS.some((i) => i.id === id));
    }
    if (Object.keys(setup).length) out.setups = { [song!]: setup };
  }
  const bandLevel = q.get("bandlevel");
  if (bandLevel && Number.isFinite(Number(bandLevel))) out.bandLevel = clamp(round(Number(bandLevel), 2), 0, 1);
  const singAs = q.get("as");
  if (singAs !== null && PRESETS.some((p) => p.id === singAs)) out.singAs = singAs;

  const preset = q.get("preset");
  if (preset !== null && PRESETS.some((p) => p.id === preset)) out.preset = preset;
  const tone: Tone = { ...presetById(out.preset ?? INITIAL.preset).tone };
  let toned = !!out.preset;
  for (const key in TONE_KEYS) {
    const k = key as keyof Tone;
    const raw = q.get(TONE_KEYS[k]);
    if (raw === null || raw === "" || !Number.isFinite(Number(raw))) continue;
    const [low, high] = TONE_RANGE[k];
    tone[k] = clamp(round(Number(raw), digitsOf(k)), low, high);
    toned = true;
  }
  if (toned) out.tone = tone;

  for (const name in NUMBERS) {
    const n = NUMBERS[name as keyof typeof NUMBERS];
    const raw = q.get(n.key);
    if (raw === null || raw === "" || !Number.isFinite(Number(raw))) continue;
    out[name as keyof typeof NUMBERS] = clamp(round(Number(raw), n.digits), n.low, n.high);
  }
  return out;
}
