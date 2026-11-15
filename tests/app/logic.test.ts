// The page's logic that has no DOM in it: the store, the share link, the guide line, the
// caption, the bodies, the keyboard and the voices it allots.
import { describe, expect, test } from "bun:test";
import { BODIES } from "../../src/contract.ts";
import type { Score } from "../../src/contract.ts";
import { BODY_NAMES, bodyAt, bodyName, keyboardBase, octavesToFit, speakingHz } from "../../src/app/bodies.ts";
import { captionAt, clock, phoneAt } from "../../src/app/caption.ts";
import { guide } from "../../src/app/guide.ts";
import { TEXT_LIMIT, decodeLink, encodeLink } from "../../src/app/link.ts";
import { hzToMidi, midiToHz, noteName } from "../../src/app/notes.ts";
import { INITIAL, LANGS } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";
import { createStore } from "../../src/app/store.ts";
import { Allotment, seating } from "../../src/app/touch/allot.ts";
import { keyNote } from "../../src/app/touch/keys.ts";

describe("the store", () => {
  test("tells a listener at once, and again only when one of its keys really changes", () => {
    const store = createStore({ a: 1, b: "x" });
    const seen: number[] = [];
    store.on(["a"], (s) => seen.push(s.a));
    store.set({ b: "y" });
    store.set({ a: 1 });
    store.set({ a: 2 });
    expect(seen).toEqual([1, 2]);
    expect(store.get()).toEqual({ a: 2, b: "y" });
  });

  test("gives the state before the change", () => {
    const store = createStore({ a: 1 });
    let was = 0;
    store.on(["a"], (_s, before) => (was = before.a));
    store.set({ a: 5 });
    expect(was).toBe(1);
  });

  test("a listener that sets again does not hide a state from the others", () => {
    const store = createStore({ a: 0, b: 0 });
    const seen: string[] = [];
    store.on(["a"], (s) => {
      if (s.a === 1) store.set({ b: 1 });
    });
    store.on(["a", "b"], (s) => seen.push(`${s.a}${s.b}`));
    store.set({ a: 1 });
    expect(seen).toEqual(["00", "10", "11"]);
  });

  test("stops telling a listener that asked to stop", () => {
    const store = createStore({ a: 0 });
    let calls = 0;
    const stop = store.on(["a"], () => calls++);
    stop();
    store.set({ a: 1 });
    expect(calls).toBe(1);
  });
});

describe("the share link", () => {
  const shared = (patch: Partial<State>) => ({ ...INITIAL, ...patch });

  test("a fresh page is a short link", () => {
    expect(encodeLink(INITIAL)).toBe("mode=touch");
  });

  test("carries a spoken performance there and back", () => {
    const s = shared({ mode: "speak", text: "Hello, world & you? ¿Qué tal?", lang: "es", body: 1, pace: 1.25, pitch: -3.5, lively: 0.2 });
    const back = decodeLink(`#${encodeLink(s)}`);
    expect(back).toEqual({ mode: "speak", text: s.text, lang: "es", body: 1, pace: 1.25, pitch: -3.5, lively: 0.2 });
  });

  test("carries a sung performance there and back", () => {
    const s = shared({ mode: "sing", song: "grace", body: 4, transpose: -2, tempo: 0.8, shimmer: 45 });
    expect(decodeLink(encodeLink(s))).toEqual({ mode: "sing", song: "grace", body: 4, transpose: -2, tempo: 0.8, shimmer: 45 });
  });

  test("names a whole body and writes a body in between as a number", () => {
    expect(encodeLink(shared({ body: 0 }))).toContain("body=child");
    expect(encodeLink(shared({ body: 2.4 }))).toContain("body=2.4");
    expect(decodeLink("body=bass").body).toBe(4);
    expect(decodeLink("body=2.4").body).toBe(2.4);
  });

  test("carries the words a person wrote for a built-in tune", () => {
    const s = shared({ mode: "sing", song: "joy", lyrics: "la la_\nlu-lu ~" });
    expect(decodeLink(encodeLink(s))).toEqual({ mode: "sing", song: "joy", lyrics: "la la_\nlu-lu ~" });
    expect(decodeLink(encodeLink(shared({ mode: "sing", song: "joy" }))).lyrics).toBeUndefined();
  });

  test("does not try to carry an imported song", () => {
    expect(encodeLink(shared({ mode: "sing", song: "imported" }))).toBe("mode=sing");
  });

  test("cuts a text too long for an address", () => {
    const link = encodeLink(shared({ mode: "speak", text: "a".repeat(5000) }));
    expect(decodeLink(link).text).toHaveLength(TEXT_LIMIT);
  });

  test("believes nothing a stranger typed without checking it", () => {
    const back = decodeLink("#mode=shout&body=giant&lang=xx&song=nope&pace=99&pitch=abc&tempo=-4&vibrato=1e9&transpose=3.7");
    expect(back).toEqual({ pace: 2, tempo: 0.5, shimmer: 80, transpose: 4 });
    expect(decodeLink("body=77").body).toBe(4);
    expect(decodeLink("")).toEqual({});
    expect(decodeLink("#%%%")).toEqual({});
  });
});

describe("the guide line", () => {
  const at = (patch: Partial<State>) => guide({ ...INITIAL, ...patch });

  test("every state says something, and says what to do next", () => {
    expect(at({ audio: "asleep" }).text).toMatch(/Tap anywhere/);
    // asleep, the first thing to do is offered as a button, said larger
    expect(at({ audio: "asleep" }).offer).toEqual({ label: "Wake the voice", act: "wake" });
    expect(at({ audio: "asleep" }).first).toBe(true);
    expect(at({ audio: "waking" }).text).toMatch(/Waking/);
    expect(at({ audio: "awake" }).text).toMatch(/Hold the pad/);
    expect(at({ audio: "failed", audioWhy: "No sound here." })).toEqual({ text: "No sound here.", trouble: true, offer: { label: "Try again", act: "wake" } });
    expect(at({ mode: "speak", reading: "loading" }).text).toBe("Learning to read English…");
    expect(at({ mode: "speak", reading: "failed", lang: "la" })).toMatchObject({ trouble: true, offer: { act: "reread" } });
    expect(at({ mode: "speak", reading: "failed", lang: "la" }).text).toMatch(/Latina dictionary did not load.*try again/);
    expect(at({ mode: "speak", reading: "ready", text: "  " }).text).toMatch(/Type something/);
    expect(at({ mode: "speak", reading: "ready", text: "hi" }).text).toMatch(/Press Speak/);
    expect(at({ mode: "sing" }).text).toMatch(/Jane Taylor/);
    expect(at({ mode: "sing", importing: "reading" }).text).toMatch(/Reading the file/);
    expect(at({ mode: "sing", importing: "failed", importWhy: "“a.txt” is not a MIDI or karaoke file." })).toEqual({
      text: "“a.txt” is not a MIDI or karaoke file. Choose a .mid or .kar file.",
      trouble: true,
    });
    expect(at({ mode: "sing", wording: true }).text).toMatch(/“-” splits a word.*“_” holds.*“~” keeps/);
    expect(at({ saving: 0.431 }).text).toBe("Rendering the file: 43%");
  });

  test("a passing remark is heard over the mode's own words, but not over trouble", () => {
    expect(at({ mode: "sing", remark: "Link copied." }).text).toBe("Link copied.");
    expect(at({ audio: "failed", audioWhy: "Broken.", remark: "Link copied." }).text).toBe("Broken.");
  });

  test("every language the page offers has a name", () => {
    for (const lang in LANGS) expect(LANGS[lang as keyof typeof LANGS].length).toBeGreaterThan(1);
  });
});

describe("the caption", () => {
  // "hi you": h a ɪ | j u, with a rest between.
  const score: Score = {
    phones: [
      { ph: "h", t: 0.1, d: 0.08 },
      { ph: "a", t: 0.18, d: 0.12 },
      { ph: "ɪ", t: 0.3, d: 0.1 },
      { ph: "_", t: 0.4, d: 0.2 },
      { ph: "j", t: 0.6, d: 0.06 },
      { ph: "u", t: 0.66, d: 0.24 },
    ],
    pitch: [{ t: 0, v: 120 }],
    words: [
      { text: "hi", t: 0.1, d: 0.3 },
      { text: "you", t: 0.6, d: 0.3 },
    ],
    length: 1,
  };

  test("shows the word being voiced and marks the sound being made", () => {
    expect(captionAt(score, 0.2, 1)).toEqual({ word: "hi", phones: ["h", "a", "ɪ"], now: 1 });
    expect(captionAt(score, 0.7, 5)).toEqual({ word: "you", phones: ["j", "u"], now: 1 });
  });

  test("is empty before the first word, between distant words, and after the end", () => {
    expect(captionAt(score, 0.05, -1).word).toBe("");
    expect(captionAt(score, 0.59, 3).word).toBe("");
    expect(captionAt(score, 1.5, -1).word).toBe("");
    expect(captionAt(score, -1, -1).word).toBe("");
  });

  test("lets a word linger a moment so it does not flicker out", () => {
    expect(captionAt(score, 0.45, 3)).toEqual({ word: "hi", phones: ["h", "a", "ɪ"], now: -1 });
  });

  test("a word's first consonants belong to it even when they begin before the word's own time", () => {
    // "to go", sung: each word's time is its vowel's, as a note's start is.
    const sung: Score = {
      phones: [
        { ph: "t", t: 0.3, d: 0.1 },
        { ph: "u", t: 0.4, d: 0.5 },
        { ph: "g", t: 0.9, d: 0.1 },
        { ph: "o", t: 1.0, d: 0.6 },
      ],
      pitch: [{ t: 0, v: 200 }],
      words: [
        { text: "to", t: 0.4, d: 0.5 },
        { text: "go", t: 1.0, d: 0.6 },
      ],
      length: 2,
    };
    expect(captionAt(sung, 0.35, 0)).toEqual({ word: "to", phones: ["t", "u"], now: 0 });
    expect(captionAt(sung, 0.8, 1)).toEqual({ word: "to", phones: ["t", "u"], now: 1 });
    expect(captionAt(sung, 0.95, 2)).toEqual({ word: "go", phones: ["g", "o"], now: 0 });
    expect(captionAt(sung, 0.2, -1).word).toBe("");
  });

  test("with no words, shows the sounds around the present one", () => {
    const bare = { ...score, words: undefined };
    expect(captionAt(bare, 0.2, 1)).toEqual({ word: "", phones: ["h", "a", "ɪ", "j"], now: 1 });
    expect(captionAt(bare, 0.7, 5)).toEqual({ word: "", phones: ["ɪ", "j", "u"], now: 2 });
  });

  test("an empty score shows nothing", () => {
    expect(captionAt({ phones: [], pitch: [], length: 0 }, 0, -1)).toEqual({ word: "", phones: [], now: -1 });
  });

  test("finds the sound by the clock when the voice does not say which it is making", () => {
    expect(phoneAt(score, 0.2)).toBe(1);
    expect(phoneAt(score, 0.3)).toBe(2);
    expect(phoneAt(score, 0.05)).toBe(-1);
    expect(phoneAt(score, 5)).toBe(-1);
  });

  test("writes seconds as a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(73.4)).toBe("1:13");
    expect(clock(-2)).toBe("0:00");
  });
});

describe("the bodies", () => {
  test("whole numbers are the contract's bodies, in order from child to bass", () => {
    expect(BODY_NAMES).toEqual(["child", "soprano", "alto", "tenor", "bass"]);
    BODY_NAMES.forEach((name, i) => {
      expect(bodyAt(i).tract).toBeCloseTo(BODIES[name].tract, 6);
      expect(bodyAt(i).folds).toBeCloseTo(BODIES[name].folds, 6);
      expect(bodyName(i)).toBe(name);
    });
  });

  test("a body in between is between its neighbours, and is called so", () => {
    const b = bodyAt(2.5);
    expect(b.tract).toBeCloseTo((BODIES.alto.tract + BODIES.tenor.tract) / 2, 6);
    expect(b.folds).toBeCloseTo((BODIES.alto.folds + BODIES.tenor.folds) / 2, 6);
    expect(bodyName(2.5)).toBe("between alto and tenor");
    expect(bodyAt(-3)).toEqual(bodyAt(0));
    expect(bodyAt(9)).toEqual(bodyAt(4));
  });

  test("a bigger body speaks lower", () => {
    for (let i = 1; i <= 4; i++) expect(speakingHz(i)).toBeLessThan(speakingHz(i - 1));
    expect(speakingHz(0)).toBeGreaterThan(250);
    expect(speakingHz(4)).toBeLessThan(110);
  });

  test("a tune is moved by whole octaves to where the body sings", () => {
    // Twinkle as written: C4 to A4.
    expect(octavesToFit(60, 69, 0)).toBe(12);
    expect(octavesToFit(60, 69, 1)).toBe(0);
    expect(octavesToFit(60, 69, 3)).toBe(-12);
    expect(octavesToFit(60, 69, 4)).toBe(-12);
  });

  test("the computer keyboard starts on a C that suits the body", () => {
    expect(keyboardBase(1)).toBe(60);
    expect(keyboardBase(3)).toBe(48);
    expect(keyboardBase(4)).toBe(36);
    expect(keyNote("KeyA", 48, 0)).toBe(48);
    expect(keyNote("KeyW", 48, 1)).toBe(61);
    expect(keyNote("Semicolon", 48, 0)).toBe(64);
    expect(keyNote("KeyQ", 48, 0)).toBeNull();
  });

  test("pitch arithmetic", () => {
    expect(midiToHz(69)).toBe(440);
    expect(hzToMidi(220)).toBeCloseTo(57, 9);
    expect(noteName(60)).toBe("C4");
    expect(noteName(57)).toBe("A3");
    expect(noteName(61.4)).toBe("C♯4");
  });
});

describe("allotting notes to voices", () => {
  test("one voice: the newest note wins, and letting go falls back to the one still held", () => {
    const a = new Allotment(1);
    a.press(60);
    a.press(64);
    expect(a.notes).toEqual([64]);
    a.release(64);
    expect(a.notes).toEqual([60]);
    a.release(60);
    expect(a.notes).toEqual([null]);
    expect(a.any).toBe(false);
  });

  test("several voices: a held chord keeps its voices", () => {
    const a = new Allotment(3);
    expect(a.press(60)).toBe(0);
    expect(a.press(64)).toBe(1);
    expect(a.press(67)).toBe(2);
    a.release(64);
    expect(a.notes).toEqual([60, null, 67]);
    expect(a.press(72)).toBe(1);
    expect(a.notes).toEqual([60, 72, 67]);
  });

  test("more keys than voices: the oldest note gives way, and comes back when there is room", () => {
    const a = new Allotment(2);
    a.press(60);
    a.press(64);
    expect(a.press(67)).toBe(0);
    expect(a.notes).toEqual([67, 64]);
    a.release(67);
    expect(a.notes).toEqual([60, 64]);
  });

  test("pressing a held key again does not use two voices", () => {
    const a = new Allotment(2);
    a.press(60);
    a.press(60);
    expect(a.notes.filter((n) => n === 60)).toHaveLength(1);
  });

  test("voices are spread from left to right and quieter the more there are", () => {
    expect(seating(0, 1)).toEqual({ place: 0, level: 0.8 });
    expect(seating(0, 6).place).toBeCloseTo(-0.7, 9);
    expect(seating(5, 6).place).toBeCloseTo(0.7, 9);
    expect(seating(0, 6).level).toBeLessThan(seating(0, 2).level);
    // Six uncorrelated voices together stay near the loudness of one.
    expect(Math.sqrt(6) * seating(0, 6).level).toBeLessThan(1.3);
  });
});
