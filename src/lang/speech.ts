/**
 * Words and pauses to a spoken Score: how long each sound lasts (durations.ts, after Klatt
 * 1979), where the pauses go and how long they are, and the pitch line.
 *
 * The pitch line is built phrase by phrase (a phrase ends at any punctuation) in semitones
 * around the speaker's own pitch, in the spirit of Pierrehumbert's account of English
 * intonation (J. Pierrehumbert, The Phonology and Phonetics of English Intonation, MIT 1980):
 * a baseline that declines through the phrase and is reset after each pause; a peak on the
 * stressed syllable of each content word, each peak lower than the one before (downstep); and
 * at the end a fall for a statement, a rise for a yes/no question, a small rise for a comma
 * (more is coming). Japanese has no stress: each word rises after its first mora and stays
 * high (the unaccented Tokyo pattern), with the same declination.
 */
import type { Phone, PhoneSymbol, Point, Score, Word } from "../contract.ts";
import { SPEECH_MS } from "./durations.ts";
import { type Break, type Syl, type Token, type WordPron, VOICELESS, isVowel, STOPS, FRICATIVES, AFFRICATES } from "./phones.ts";

export interface SpeechSettings {
  lang: string;
  rate: number;
  pitch: number;
  lively: number;
}

/** how much each language's vowels are of English's (English vowels are long) */
const VOWEL_SCALE: Record<string, number> = { en: 1, es: 0.72, it: 0.78, la: 0.82, ja: 0.68, ipa: 0.85 };

/** pause after each kind of break, in seconds at the ordinary rate */
const PAUSE: Record<Break, number> = { comma: 0.24, colon: 0.34, stop: 0.55, question: 0.55, exclaim: 0.55, paragraph: 0.85 };
const LEAD = 0.2;
const TAIL = 0.3;

const WH = /^(what|where|when|why|who|whom|whose|which|how|qu[eé]|qui[eé]n(es)?|d[oó]nde|cu[aá]ndo|c[oó]mo|cu[aá]l(es)?|che|chi|dove|quando|come|quale|perch[eé])$/i;

interface Phrase {
  words: WordPron[];
  end: Break | "end";
}

/** a syllable once timed: where its vowel is, for the pitch line */
interface SylTime {
  start: number;
  vowelStart: number;
  vowelEnd: number;
  end: number;
  accent: boolean;
  /** Japanese: high after the first mora of the word */
  high: boolean;
}

const ms = (p: PhoneSymbol, k: number): number => {
  const [inh, min] = SPEECH_MS[p];
  return (min + (inh - min) * k) / 1000;
};

function phrasesOf(tokens: Token[]): Phrase[] {
  const out: Phrase[] = [];
  let words: WordPron[] = [];
  for (const t of tokens) {
    if (t.kind === "word") words.push(t.word);
    else if (words.length) {
      out.push({ words, end: t.type });
      words = [];
    }
  }
  if (words.length) out.push({ words, end: "end" });
  return out;
}

/** Japanese long vowels: the lengthening mora becomes the length of the vowel before it. */
function foldLength(word: WordPron): WordPron {
  if (!word.syls.some((s) => s.lengthens)) return word;
  const syls: Syl[] = [];
  for (const s of word.syls) {
    const prev = syls[syls.length - 1];
    if (s.lengthens && prev && prev.nucleus.length) {
      const last = prev.nucleus[prev.nucleus.length - 1];
      prev.nucleus = [...prev.nucleus.slice(0, -1), { ...last, long: true }];
    } else syls.push({ ...s, nucleus: [...s.nucleus] });
  }
  return { ...word, syls };
}

export function speakTokens(tokens: Token[], o: SpeechSettings): Score {
  const phones: Phone[] = [];
  const words: Word[] = [];
  const pitch: Point[] = [];
  const rate = Math.max(0.25, Math.min(4, o.rate));
  const vowelScale = VOWEL_SCALE[o.lang] ?? 0.85;
  const stressTimed = o.lang !== "ja";
  let t = 0;
  const add = (ph: PhoneSymbol, d: number, stress: 0 | 1 | 2) => {
    const dd = Math.max(0.012, d / rate);
    phones.push({ ph, t, d: dd, stress });
    t += dd;
  };
  add("_", LEAD * rate, 0);

  const phrases = phrasesOf(tokens);
  const R = 2 * Math.max(0, Math.min(1, o.lively));
  const st: Point[] = [];

  phrases.forEach((phrase, pi) => {
    const times: SylTime[] = [];
    const end = phrase.end === "end" ? "stop" : phrase.end;
    const final = end === "comma" || end === "colon" ? 1.3 : 1.55;
    const ws = phrase.words.map(foldLength);
    ws.forEach((w, wi) => {
      const wordStart = t;
      w.syls.forEach((s, k) => {
        const last = wi === ws.length - 1 && k === w.syls.length - 1;
        const sylStart = t;
        const stressed = s.stress === 1;
        const accent = stressed && !w.func && stressTimed;
        // onset consonants
        s.onset.forEach((c) => {
          let f = 1;
          if (s.onset.length > 1) f *= 0.75;
          if (!s.stress) f *= 0.8;
          if (k === 0) f *= 1.1;
          add(c.ph, ms(c.ph, f) * (c.long ? 1.8 : 1), s.stress);
        });
        // the vowel
        const vowelStart = t;
        let f = stressTimed ? (s.stress === 1 ? 1 : s.stress === 2 ? 0.8 : 0.6) : 0.9;
        if (w.func) f *= 0.65;
        if (w.syls.length > 1) f *= 0.85;
        if (k < w.syls.length - 1) f *= 0.85;
        if (last) f *= final;
        if (accent) f *= 1.1;
        const coda0 = s.coda[0]?.ph;
        if (coda0 && (STOPS.has(coda0) || AFFRICATES.has(coda0) || FRICATIVES.has(coda0))) f *= VOICELESS.has(coda0) ? 0.78 : 1.12;
        // Italian and Latin lengthen a stressed vowel in an open syllable before the last
        if ((o.lang === "it" || o.lang === "la") && stressed && s.coda.length === 0 && k < w.syls.length - 1) f *= 1.35;
        const v0 = s.nucleus[0];
        if (v0 && !isVowel(v0.ph)) {
          // a syllabic nasal (Japanese n): a mora's worth of hum
          add(v0.ph, 0.09 * (last ? final : 1), 0);
        } else if (s.nucleus.length === 2) {
          // a diphthong: one long vowel's worth, most of it on the first quality
          const d = ms(s.nucleus[0].ph, f * 1.3) * vowelScale;
          add(s.nucleus[0].ph, d * 0.55, s.stress);
          add(s.nucleus[1].ph, d * 0.45, s.stress);
        } else if (v0) {
          let d = ms(v0.ph, f) * vowelScale * (v0.long ? 1.7 : 1);
          if (v0.faint) d = Math.max(0.025, d * 0.35);
          add(v0.ph, d, s.stress);
        }
        const vowelEnd = t;
        // coda consonants
        s.coda.forEach((c) => {
          let g = 1;
          if (s.coda.length > 1) g *= 0.75;
          if (!s.stress) g *= 0.8;
          if (last) g *= 1.3;
          add(c.ph, isVowel(c.ph) ? ms(c.ph, 0.5) * vowelScale : ms(c.ph, g) * (c.long ? 1.8 : 1), s.stress);
        });
        times.push({ start: sylStart, vowelStart, vowelEnd, end: t, accent, high: !stressTimed && k > 0 });
      });
      words.push({ text: w.text, t: wordStart, d: t - wordStart });
    });

    // the pitch line of this phrase, in semitones
    const T0 = times[0]?.start ?? t;
    const base = (x: number) => R * (0.8 - Math.min(2.6, 1.1 * (x - T0)));
    const question = end === "question" && !WH.test(ws[0]?.text ?? "");
    const accents = times.filter((s) => s.accent);
    const nuclear = accents[accents.length - 1];
    st.push({ t: T0, v: base(T0) });
    let peak = R * 2.2 * (end === "exclaim" ? 1.4 : 1);
    for (const s of times) {
      const mid = s.vowelStart + 0.6 * (s.vowelEnd - s.vowelStart);
      if (nuclear && s.start > nuclear.start) break; // after the last accent: straight to the end
      if (s === nuclear && question) st.push({ t: mid, v: base(mid) - 0.5 * R });
      else if (s.accent) {
        st.push({ t: s.vowelStart, v: base(s.vowelStart) + 0.2 * peak });
        st.push({ t: mid, v: base(mid) + peak });
        peak = Math.max(R * 0.8, peak * 0.8);
      } else if (s.high) st.push({ t: mid, v: base(mid) + R * 0.9 });
      else st.push({ t: mid, v: base(mid) });
    }
    const lastTime = times[times.length - 1];
    const tEnd = lastTime ? lastTime.end : t;
    const endValue = question ? base(tEnd) + 3.2 * R : end === "comma" || end === "colon" ? base(tEnd) + 0.9 * R : base(tEnd) - 1.6 * R;
    st.push({ t: tEnd, v: endValue });

    // the pause
    const pause = pi === phrases.length - 1 ? TAIL : PAUSE[end];
    add("_", pause * rate, 0);
  });
  if (phrases.length === 0) add("_", TAIL * rate, 0);

  // semitones to Hz, kept in time order
  let lastT = -Infinity;
  for (const p of st) {
    const tt = Math.max(lastT, p.t);
    pitch.push({ t: tt, v: o.pitch * 2 ** (Math.max(-12, Math.min(12, p.v)) / 12) });
    lastT = tt;
  }
  if (pitch.length === 0) pitch.push({ t: 0, v: o.pitch });
  return { phones, pitch, words, length: t };
}
