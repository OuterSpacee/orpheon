// Speak: text in, speech out through the language layer's speak().
import type { Score } from "../../contract.ts";
import { ready, speak } from "../../lang/index.ts";
import type { Lang } from "../../lang/index.ts";
import type { App, ModeParts } from "../app.ts";
import { BODY_MAX, bodyName, spokenHz } from "../bodies.ts";
import { el } from "../dom.ts";
import { SOLO } from "../save.ts";
import { helloScore } from "../scores.ts";
import { LANGS } from "../state.ts";
import { choice, slider } from "../ui/controls.ts";

export function mountSpeak(app: App): ModeParts {
  const { store, sound } = app;
  const s0 = store.get();

  /** Load what the language needs, once for each language; the guide line tells how it goes. */
  let asked: Lang | null = null;
  async function learn(lang: Lang): Promise<boolean> {
    if (asked === lang && store.get().reading === "ready") return true;
    asked = lang;
    store.set({ reading: "loading" });
    try {
      await ready(lang);
      if (asked === lang) store.set({ reading: "ready" });
      return asked === lang;
    } catch (error) {
      console.error(error);
      if (asked === lang) store.set({ reading: "failed", remark: "" });
      return false;
    }
  }

  async function say(): Promise<void> {
    const s = store.get();
    if (s.playing) return app.stop();
    const text = s.text.trim();
    if (!text) {
      field.focus();
      return;
    }
    if (!(await sound.wake()) || !(await learn(s.lang))) return;
    const hz = spokenHz(s.body, s.pitch);
    let score: Score;
    try {
      score = speak(text, { lang: s.lang, rate: s.pace, pitch: hz, lively: s.lively });
    } catch (error) {
      console.error(error);
      return app.remark("That could not be read. Try plainer words, or spell it in sounds with the IPA choice.");
    }
    if (!score.phones.length) {
      // Nothing came back (the language layer may not be here yet): say the line known by heart.
      score = helloScore(hz);
      app.remark("No sounds came back for that text, so the voice says the one word it knows by heart.");
    }
    app.begin({ kind: "speak", title: text, parts: [{ score, body: s.body, ...SOLO }] });
  }

  // ── the controls ──
  const language = choice({
    label: "Language",
    options: (Object.keys(LANGS) as Lang[]).map((value) => ({ value, label: LANGS[value], lang: value === "ipa" ? undefined : value })),
    value: s0.lang,
    pick: (lang) => store.set({ lang }),
  });
  const pace = slider({
    label: "Pace", min: 0.5, max: 2, step: 0.05, value: s0.pace,
    show: (v) => `${v.toFixed(2)}×`, input: (v) => store.set({ pace: v }),
  });
  const pitch = slider({
    label: "Pitch", min: -12, max: 12, step: 0.5, value: s0.pitch,
    show: (v) => `${Math.round(spokenHz(store.get().body, v))} Hz`, input: (v) => store.set({ pitch: v }),
  });
  const lively = slider({
    label: "Liveliness", min: 0, max: 1, step: 0.01, value: s0.lively, ends: ["monotone", "lively"],
    input: (v) => store.set({ lively: v }),
  });
  const body = slider({
    label: "Body", min: 0, max: BODY_MAX, step: 0.05, value: s0.body, numeric: false,
    show: bodyName, input: (v) => store.set({ body: v }),
  });
  store.on(["lang"], (s) => language.set(s.lang));
  store.on(["pace"], (s) => pace.set(s.pace));
  store.on(["pitch", "body"], (s) => pitch.set(s.pitch));
  store.on(["lively"], (s) => lively.set(s.lively));
  store.on(["body"], (s) => body.set(s.body));
  // Start learning a language as soon as it is the one in use, not when Speak is pressed.
  store.on(["lang", "mode"], (s) => {
    if (s.mode === "speak") void learn(s.lang);
  });

  const controls = el("div.mode-controls", {}, el("div.group.wide", {}, language.root), el("div.group", {}, el("h2.group-title", {}, "Delivery"), pace.root, pitch.root, lively.root), el("div.group", {}, el("h2.group-title", {}, "Voice"), body.root));

  // ── the surface: where the words are typed ──
  const field = el("textarea.say", {
    rows: 2,
    spellcheck: "false",
    maxlength: 4000,
    placeholder: "Type something for the voice to say",
    "aria-label": "Text to speak",
    oninput: () => store.set({ text: field.value }),
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void say();
      }
    },
  });
  store.on(["text"], (s) => {
    if (field.value !== s.text) field.value = s.text;
  });
  store.on(["lang"], (s) => {
    field.lang = s.lang === "ipa" ? "" : s.lang;
    field.placeholder = s.lang === "ipa" ? "Type sounds in IPA, like həˈloʊ" : "Type something for the voice to say";
  });

  return {
    controls,
    surface: el("div.speak-surface", {}, field),
    go: { label: "Speak", act: () => void say() },
    retry: () => void learn(store.get().lang),
  };
}
