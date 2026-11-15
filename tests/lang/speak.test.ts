/**
 * Spoken Scores: every one well formed, a speaking rate a person would use, pauses where the
 * punctuation is, the lengthening and shortening rules visible in the durations, and a pitch
 * line that falls at a statement's end, rises at a yes/no question and is flat for a monotone.
 */
import { describe, expect, test } from "bun:test";
import type { Score } from "../../src/contract.ts";
import { type Lang, ready, speak } from "../../src/lang/index.ts";
import { pitchAt, problems } from "./check.ts";

await ready("en");

const TEXTS: [Lang, string][] = [
  ["en", "The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon."],
  ["en", "Dr. Jones paid $45.50 on March 3rd, 1999 — didn't she? Yes!"],
  ["en", ""],
  ["en", "..."],
  ["es", "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo."],
  ["it", "Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura, ché la diritta via era smarrita."],
  ["la", "Pater noster, qui es in caelis, sanctificetur nomen tuum. Adveniat regnum tuum."],
  ["ja", "むかしむかし、あるところに、おじいさんとおばあさんがすんでいました。"],
  ["ipa", "ðə ˈnɔɹθ wɪnd ænd ðə sʌn wɚ dɪˈspjuɾɪŋ wɪtʃ wəz ðə ˈstɹɔŋɡɚ."],
];

const voiced = (s: Score) => s.phones.filter((p) => p.ph !== "_");
const speaking = (s: Score) => voiced(s).reduce((a, p) => a + p.d, 0);
const syllables = (s: Score, lang: Lang) => {
  // count vowel phones that start a nucleus: a diphthong's second half is not a new syllable
  const vowels = new Set(["i", "y", "ɨ", "ɯ", "u", "ɪ", "ʊ", "e", "ø", "o", "ə", "ɛ", "œ", "ɜ", "ʌ", "ɔ", "æ", "a", "ɑ", "ɒ", "ɚ"]);
  let n = 0;
  s.phones.forEach((p, i) => {
    const prev = s.phones[i - 1];
    if (vowels.has(p.ph) && !(prev && vowels.has(prev.ph) && lang === "en")) n++;
  });
  return n;
};
const pauses = (s: Score) => s.phones.slice(1, -1).filter((p) => p.ph === "_");

describe("every spoken score is well formed", () => {
  for (const [lang, text] of TEXTS) {
    test(`${lang}: ${text.slice(0, 40) || "(empty)"}`, () => {
      const s = speak(text, { lang });
      expect(problems(s)).toEqual([]);
      // the phones cover the score without gaps
      for (let i = 1; i < s.phones.length; i++) expect(s.phones[i].t).toBeCloseTo(s.phones[i - 1].t + s.phones[i - 1].d, 9);
      for (const rate of [0.5, 2]) expect(problems(speak(text, { lang, rate, pitch: 220, lively: 1 }))).toEqual([]);
    });
  }
});

describe("timing", () => {
  test("English at an ordinary pace: about 3 to 6 syllables a second while speaking", () => {
    const s = speak(TEXTS[0][1]);
    const rate = syllables(s, "en") / speaking(s);
    expect(rate).toBeGreaterThan(3);
    expect(rate).toBeLessThan(6);
  });

  test("Spanish, Italian and Japanese run faster than English, syllable for syllable", () => {
    const en = speak(TEXTS[0][1]);
    const enRate = syllables(en, "en") / speaking(en);
    for (const i of [4, 5, 7]) {
      const [lang, text] = TEXTS[i];
      const s = speak(text, { lang });
      const r = syllables(s, lang) / speaking(s);
      expect(r).toBeGreaterThan(enRate);
      expect(r).toBeLessThan(10);
    }
  });

  test("rate 2 takes about half the time, rate 0.5 about twice", () => {
    const base = speaking(speak(TEXTS[0][1]));
    expect(speaking(speak(TEXTS[0][1], { rate: 2 })) / base).toBeCloseTo(0.5, 1);
    expect(speaking(speak(TEXTS[0][1], { rate: 0.5 })) / base).toBeCloseTo(2, 1);
  });

  test("a pause at each comma and full stop, longer at the stop, none between plain words", () => {
    expect(pauses(speak("Hello world"))).toHaveLength(0);
    const s = speak("Hello, world. Goodbye");
    const [comma, stop] = pauses(s);
    expect(pauses(s)).toHaveLength(2);
    expect(comma.d).toBeGreaterThan(0.15);
    expect(stop.d).toBeGreaterThan(comma.d * 1.5);
    // the comma's pause comes right after "hello"
    expect(s.words![0].text).toBe("Hello");
    expect(comma.t).toBeCloseTo(s.words![0].t + s.words![0].d, 9);
  });

  test("a word before a pause is longer than the same word inside the phrase", () => {
    const vowelOf = (s: Score, word: number) => {
      const w = s.words![word];
      return s.phones.filter((p) => p.t >= w.t - 1e-9 && p.t < w.t + w.d - 1e-9 && p.ph !== "g").reduce((a, p) => a + p.d, 0);
    };
    expect(vowelOf(speak("We go."), 1)).toBeGreaterThan(vowelOf(speak("We go home."), 1) * 1.25);
  });

  test("a stressed vowel outlasts the unstressed ones beside it (banana)", () => {
    const v = speak("banana").phones.filter((p) => p.ph === "æ" || p.ph === "ə");
    const stressed = v.find((p) => p.ph === "æ")!;
    for (const p of v) if (p !== stressed) expect(stressed.d).toBeGreaterThan(p.d * 1.5);
    expect(stressed.stress).toBe(1);
  });

  test("a consonant in a cluster is shorter than alone (the s of sit and street)", () => {
    const s1 = speak("sit").phones.find((p) => p.ph === "s")!;
    const s2 = speak("street").phones.find((p) => p.ph === "s")!;
    expect(s2.d).toBeLessThan(s1.d * 0.9);
  });

  test("a vowel before a voiceless stop is shorter than before a voiced one (bit, bid)", () => {
    const v = (w: string) => speak(w).phones.find((p) => p.ph === "ɪ")!.d;
    expect(v("bit")).toBeLessThan(v("bid") * 0.85);
  });

  test("captions: one word a word, in order, covering its own sounds", () => {
    const s = speak("Twenty one pilots, 3 cats!");
    expect(s.words!.map((w) => w.text)).toEqual(["Twenty", "one", "pilots", "three", "cats"]);
    for (const w of s.words!) {
      const inside = s.phones.filter((p) => p.t >= w.t - 1e-9 && p.t + p.d <= w.t + w.d + 1e-9);
      expect(inside.length).toBeGreaterThan(1);
      expect(inside.some((p) => p.ph === "_")).toBe(false);
    }
  });
});

describe("the pitch line", () => {
  const range = (s: Score, from: number, to: number) => {
    const vs = s.pitch.filter((p) => p.t >= from && p.t <= to).map((p) => p.v);
    return { max: Math.max(...vs), min: Math.min(...vs) };
  };
  const lastVowelEnd = (s: Score) => {
    const v = voiced(s);
    return v[v.length - 1].t + v[v.length - 1].d;
  };

  test("a statement falls at its end, below where it started", () => {
    const s = speak("The cat sat on the mat.", { pitch: 120 });
    const end = pitchAt(s, lastVowelEnd(s));
    expect(end).toBeLessThan(pitchAt(s, voiced(s)[0].t));
    expect(end).toBeLessThan(120);
    expect(range(s, 0, s.length).max).toBeGreaterThan(130);
  });

  test("a yes/no question rises at its end; a question with a wh-word falls", () => {
    const yesNo = speak("Is the cat on the mat?", { pitch: 120 });
    const wh = speak("Where is the cat?", { pitch: 120 });
    const rise = pitchAt(yesNo, lastVowelEnd(yesNo));
    expect(rise).toBeGreaterThan(130);
    const fall = pitchAt(wh, lastVowelEnd(wh));
    expect(fall).toBeLessThan(120);
  });

  test("a comma leaves the pitch up (more is coming), and the next phrase starts high again", () => {
    const s = speak("When the sun rose, the birds began to sing.", { pitch: 120 });
    const comma = pauses(s)[0];
    const before = pitchAt(s, comma.t);
    const statementEnd = pitchAt(s, lastVowelEnd(s));
    expect(before).toBeGreaterThan(statementEnd);
    const next = voiced(s).find((p) => p.t > comma.t)!;
    expect(pitchAt(s, next.t)).toBeGreaterThan(before - 15);
  });

  test("the peaks step down through a phrase", () => {
    const s = speak("Many young men made marvelous melodies yesterday", { pitch: 120 });
    const peaks = s.pitch.filter((p, i) => i > 0 && i < s.pitch.length - 1 && p.v > s.pitch[i - 1].v && p.v >= s.pitch[i + 1].v).map((p) => p.v);
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks[peaks.length - 1]).toBeLessThan(peaks[0]);
  });

  test("lively 0 is a monotone at the given pitch", () => {
    const s = speak("Is this flat? Yes, quite flat.", { pitch: 150, lively: 0 });
    for (const p of s.pitch) expect(p.v).toBeCloseTo(150, 6);
  });

  test("the pitch stays within an octave of the speaker's own", () => {
    for (const [lang, text] of TEXTS) {
      const s = speak(text, { lang, pitch: 200, lively: 1 });
      for (const p of s.pitch) {
        expect(p.v).toBeGreaterThan(100);
        expect(p.v).toBeLessThan(400);
      }
    }
  });
});
