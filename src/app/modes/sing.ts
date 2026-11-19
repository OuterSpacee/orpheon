// Sing: words and a tune through the language layer's sing(); with the choir on, the parts the
// arranger writes (or an imported file's own, through acappella()), each with a head of its own;
// with the band on, the instruments the arranger gives it. Who sings what is planned in
// sing/plan.ts; this is the column of controls, the roll and the words.
import { TELEMETRY } from "../../contract.ts";
import { describeFit, fitLyrics, ready } from "../../lang/index.ts";
import type { Lang, NoteIn } from "../../lang/index.ts";
import type { App, ModeParts } from "../app.ts";
import { BODY_MAX, bodyName } from "../bodies.ts";
import { el } from "../dom.ts";
import { PRESETS } from "../instrument/presets.ts";
import { SONG_FILES, readSongFile } from "../sing/import.ts";
import { ARRANGER_ONLINE, adviceSays, askArranger, briefOf, wordsFit } from "../sing/advice.ts";
import { liveMix, lineup, otherTracks, performance, roundWorks } from "../sing/plan.ts";
import type { Line, Lineup } from "../sing/plan.ts";
import { STYLES, setupOf, setupPatch, trackUse } from "../sing/setup.ts";
import type { Style } from "../sing/setup.ts";
import { SONGS, chosenTune, songById, tidy, timed } from "../songs.ts";
import type { Tune } from "../songs.ts";
import { LANGS } from "../state.ts";
import type { State } from "../state.ts";
import { mountBand } from "../ui/band.ts";
import { action, choice, section, slider, toggle } from "../ui/controls.ts";
import { mountRoll } from "../ui/roll.ts";
import { mountSingers } from "../ui/singers.ts";
import { lineupToDress } from "../ui/dress.ts";

/** The voices a song can be sung with: its own, or any Instrument preset. */
const VOICES = [{ id: "own", name: "Its own voice" }, ...PRESETS.map((p) => ({ id: p.id, name: p.name }))];

/** The built-in song chosen, when it is written for a choir. */
const written = (s: State) => (s.song === "imported" ? undefined : songById(s.song)?.voices?.length ? songById(s.song) : undefined);
/** An imported file with tracks besides its tune: acappella() sings those, not the arranger. */
const fileParts = (s: State) => {
  const source = s.song === "imported" ? chosenTune(s)?.source : undefined;
  return source ? otherTracks(source).length : 0;
};

export function mountSing(app: App): ModeParts {
  const { store, sound } = app;
  const s0 = store.get();
  const roll = mountRoll();

  /** The line-up the controls describe (worked out a moment after they settle), and the one singing now. */
  let planned: Lineup | null = null;
  let singing: readonly Line[] = [];

  async function singNow(): Promise<void> {
    const s = store.get();
    if (s.playing) return app.stop();
    const tune = chosenTune(s);
    if (!tune) return app.remark("Choose a song first, or import a file.");
    if (!(await sound.wake())) return;
    try {
      await ready(tune.lang);
    } catch (error) {
      // Without its dictionary English falls back on spelling rules; the song still sings.
      console.error(error);
    }
    const now = store.get();
    const lu = lineup(now);
    if (!lu) return app.remark("Choose a song first, or import a file.");
    const made = performance(lu, now);
    singing = lu.lines;
    app.begin(made.performance);
    if (made.said.length) app.remark(made.said.join(" "));
  }

  // ── the song ──
  const songs = choice({
    label: "Song",
    options: [...SONGS.map((song) => ({ value: song.id, label: song.title, lang: song.lang })), { value: "imported", label: "Your file" }],
    value: s0.song,
    pick: (song) => store.set({ song, importing: "no", lyrics: null }),
  });
  // The imported tune joins the list under its own title once there is one.
  const mine = songs.root.querySelector<HTMLInputElement>('input[value="imported"]')!.parentElement!;
  store.on(["imported"], (s) => {
    mine.hidden = !s.imported;
    mine.lastElementChild!.textContent = s.imported?.title || "Your file";
  });

  const picker = el("input", {
    type: "file",
    accept: SONG_FILES,
    hidden: true,
    tabindex: -1,
    onchange: async () => {
      const file = picker.files?.[0];
      picker.value = "";
      if (!file) return;
      store.set({ importing: "reading" });
      const lang = store.get().lang;
      const result = await readSongFile(file, lang === "ipa" ? "en" : lang);
      // A failure is said in place of any passing remark, and stays until another song is chosen.
      if (!result.ok) return store.set({ importing: "failed", importWhy: result.message, remark: "" });
      // A new file starts from its own defaults: what was set for the last one does not carry over.
      const { imported: _old, ...setups } = store.get().setups;
      store.set({ imported: result.tune, song: "imported", importing: "no", lyrics: null, setups });
      if (ARRANGER_ONLINE && store.get().aiArrange) void advise(result.tune, file.name);
      const others = result.tune.source ? otherTracks(result.tune.source).length : 0;
      app.remark(
        `Read ${result.tune.notes.length} notes${result.tune.lyrics ? " and their words" : ", with no words: it will be sung on “la”"}.` +
          (others ? ` ${others === 1 ? "One other track" : `${others} other tracks`} can be sung by the choir or played by the band.` : "") +
          (result.notes.length ? ` ${result.notes[0]}` : ""),
      );
    },
  });
  const browse = action("Import a MIDI or karaoke file", () => picker.click());

  // The AI arranger: a brief of each imported file goes to it, and its advice steers the
  // arrangement the page already made (sing/advice.ts). Said here, and switchable.
  const aiToggle = toggle("Let AI arrange imported files", store.get().aiArrange, (on) => store.set({ aiArrange: on }));
  store.on(["aiArrange"], (s) => aiToggle.set(s.aiArrange));
  const aiNote = el("p.ai-note");
  store.on(["song"], (s) => (aiNote.hidden = s.song !== "imported"));
  let asking: AbortController | null = null;
  async function advise(tune: Tune, file: string): Promise<void> {
    asking?.abort();
    const mine = (asking = new AbortController());
    aiNote.textContent = "Asking the arranger about this song…";
    const { advice, why } = await askArranger(briefOf(tune, file), mine.signal);
    const s = store.get();
    // A newer file, or the arranger switched off while it thought: this answer is no one's.
    const imported = s.imported;
    if (mine.signal.aborted || !imported || imported.source !== tune.source || !s.aiArrange) return;
    if (!advice) {
      aiNote.textContent = why ? `Arranged here on the page: ${why}` : "";
      return;
    }
    const hadWords = !!tune.lyrics.trim();
    // Words from the model's memory only when they fit the tune, a syllable to a note or near it.
    const offered = !hadWords && !!advice.words;
    const gave = offered && wordsFit(advice.words!.text, tune.notes.length);
    const title = advice.song.known && advice.song.title ? advice.song.title : imported.title;
    store.set({
      imported: { ...imported, title, ...(gave ? { lang: advice.words!.language } : {}) },
      ...(gave ? { lyrics: advice.words!.text } : {}),
      // the arranger arranges: a choir, staged its way, with its band
      ...setupPatch(s, { choir: true, band: true, instruments: advice.band, style: "staged", prefer: advice.plan, variant: 0, bandWhy: `Chosen by the AI arranger${advice.mood ? `: ${advice.mood}` : ""}` }),
    });
    aiNote.textContent = adviceSays(advice, hadWords, gave, offered && !gave);
  }

  // For an imported file only: what language its words are in.
  const spoken = (Object.keys(LANGS) as Lang[]).filter((l) => l !== "ipa");
  const words = choice({
    label: "Its words are in",
    options: spoken.map((value) => ({ value, label: LANGS[value], lang: value })),
    value: s0.imported?.lang ?? "en",
    pick: (lang) => {
      const imported = store.get().imported;
      if (imported) store.set({ imported: { ...imported, lang } });
    },
  });
  const fromFile = el("div.group.wide", {}, words.root);
  store.on(["imported"], (s) => words.set(s.imported?.lang ?? "en"));

  // ── the choir: on or off for each song, how many voices, in what style ──
  const choir = toggle("Choir: a head for each part", false, (on) => {
    const s = store.get();
    // Off again: the tracks marked to sing go back to their default.
    const tracks = on ? setupOf(s).tracks : Object.fromEntries(Object.entries(setupOf(s).tracks).filter(([, use]) => use !== "sing"));
    store.set(setupPatch(s, { choir: on, tracks }));
  });
  const voices = slider({
    label: "Voices", min: 2, max: 6, step: 1, value: 4,
    show: (v) => String(v), input: (v) => store.set(setupPatch(store.get(), { voices: v })),
  });
  const style = choice({
    label: "Style",
    row: true,
    options: STYLES.map((x) => ({ value: x.id, label: x.name })),
    value: "staged" as Style,
    pick: (v) => store.set(setupPatch(store.get(), { style: v })),
  });
  // The staged plan in a line, under the style: who sings when; and another of the critic's plans.
  const story = el("p.style-story");
  const another = action("Try another", () => {
    const now = store.get();
    store.set(setupPatch(now, { variant: (setupOf(now).variant ?? 0) + 1 }));
  });
  another.classList.add("try-another");
  const roundOption = style.root.querySelector<HTMLInputElement>('input[value="round"]')!.parentElement!;
  const oohsOption = style.root.querySelector<HTMLInputElement>('input[value="oohs"]')!.parentElement!;
  const singAs = slider({
    label: "Sung by", min: 0, max: VOICES.length - 1, step: 1, value: Math.max(0, VOICES.findIndex((v) => v.id === s0.singAs)), numeric: false,
    show: (v) => VOICES[v]?.name ?? "", input: (v) => store.set({ singAs: VOICES[v].id }),
  });
  store.on(["singAs"], (s) => singAs.set(Math.max(0, VOICES.findIndex((v) => v.id === s.singAs))));

  const transpose = slider({
    label: "Transpose", min: -12, max: 12, step: 1, value: s0.transpose,
    show: (v) => (v > 0 ? `+${v}` : String(v)), input: (v) => store.set({ transpose: v }),
  });
  const tempo = slider({
    label: "Tempo", min: 0.5, max: 2, step: 0.05, value: s0.tempo,
    show: (v) => `${v.toFixed(2)}×`, input: (v) => store.set({ tempo: v }),
  });
  const shimmer = slider({
    label: "Vibrato", min: 0, max: 80, step: 1, value: s0.shimmer,
    show: (v) => `${v} cents`, input: (v) => store.set({ shimmer: v }),
  });
  const body = slider({
    label: "Body", min: 0, max: BODY_MAX, step: 0.05, value: s0.body, numeric: false,
    show: bodyName, input: (v) => store.set({ body: v }),
  });
  store.on(["song"], (s) => songs.set(s.song));
  store.on(["transpose"], (s) => transpose.set(s.transpose));
  store.on(["tempo"], (s) => tempo.set(s.tempo));
  store.on(["shimmer"], (s) => shimmer.set(s.shimmer));
  store.on(["body"], (s) => body.set(s.body));

  /** The notes on the roll, which the words are fitted to. */
  let rollNotes: NoteIn[] = [];

  // ── the band and the singers, each folded under its title ──
  const band = mountBand(app);
  const bandSection = section("Band", false, band.root);
  const singers = mountSingers(app);
  const singersSection = section("Singers", true, singers.root);

  // ── the words, to read and to change: the tune's own until the person writes others ──
  const wordsField = el("textarea.words", {
    rows: 5,
    spellcheck: "false",
    maxlength: 6000,
    "aria-label": "Words to sing",
    placeholder: "No words: the tune is sung on “la”. Write some, a line for each phrase.",
    oninput: () => {
      const tune = chosenTune(store.get());
      store.set({ lyrics: tune && tidy(wordsField.value) === tidy(tune.lyrics) ? null : wordsField.value });
    },
    onfocus: () => store.set({ wording: true }),
    onblur: () => store.set({ wording: false }),
  });
  const ownWords = action("Back to its own words", () => store.set({ lyrics: null }));
  store.on(["song", "imported", "lyrics"], (s) => {
    const tune = chosenTune(s);
    const shown = s.lyrics ?? tidy(tune?.lyrics ?? "");
    // Never rewrite the field under the person typing in it.
    if (document.activeElement !== wordsField || s.lyrics === null) {
      if (tidy(wordsField.value) !== tidy(shown)) wordsField.value = shown;
    }
    wordsField.lang = tune?.lang ?? "";
    ownWords.hidden = s.lyrics === null;
  });
  const fitLine = el("p.words-fit", { "aria-live": "polite" });
  const wordsSection = section("Words", true, wordsField, fitLine, ownWords);

  // How the words fit the tune: a line under the field, and each syllable under its note on the roll.
  const dictionaries = new Set<Lang>();
  function fitWords(): void {
    const s = store.get();
    const tune = chosenTune(s);
    const fit = tune && rollNotes.length ? fitLyrics(rollNotes, s.lyrics ?? tune.lyrics, tune.lang) : null;
    roll.words(fit);
    fitLine.textContent = fit ? describeFit(fit) : "";
    // English syllables come from its dictionary: fit again once it has loaded.
    if (tune && !dictionaries.has(tune.lang)) {
      dictionaries.add(tune.lang);
      ready(tune.lang).then(fitWords, () => {});
    }
  }

  // ── keeping it all in step with the state ──
  /** Show what the line-up will be: the controls that fit it, the singers, the band, the roll. */
  function showPlan(s: State): void {
    const setup = setupOf(s);
    const tune = chosenTune(s);
    const ownParts = !!written(s);
    const fromTracks = fileParts(s) > 0 && !!tune?.source && otherTracks(tune.source).some((t) => trackUse(setup, t.index) === "sing");
    choir.set(setup.choir);
    voices.set(setup.voices);
    style.set(setup.style);
    // A song written for a choir keeps its own parts; a file's tracks are sung as the file has them.
    voices.root.hidden = !setup.choir || ownParts;
    // A file's own parts are staged or sung as the file has them: its oohs and round are not theirs.
    style.root.hidden = !setup.choir || ownParts;
    oohsOption.hidden = fromTracks;
    const staged = !style.root.hidden && setup.style === "staged" && !!planned?.story;
    story.textContent = staged ? planned!.story! : "";
    // "Try another" and which plan this is, when there is more than one
    const count = planned?.plans?.count ?? 0;
    another.hidden = !staged || count < 2;
    another.textContent = count > 1 ? `Try another · ${planned!.plans!.rank + 1} of ${count}` : "Try another";
    roundOption.hidden = fromTracks || !tune || !roundWorks(arrangedFrom(s));
    fromFile.hidden = s.song !== "imported" || !s.imported;
    const arranged = (planned?.lines.length ?? 1) > 1;
    // A choir's bodies are its arrangement's: the body control steps back while one sings.
    body.root.hidden = arranged;
    transpose.root.hidden = arranged && fromTracks;
    const lines = s.playing ? singing : (planned?.lines ?? []);
    singersSection.root.hidden = lines.length < 2;
    singersSection.note(lines.length > 1 ? `${lines.length}` : "");
    singers.show(lines);
    lineupToDress(lines.map((l) => l.name));
    band.show(planned);
    bandSection.note(band.summary());
  }

  /** The tune notes a round is tried on: as the arranger would be given them. */
  const roundNotes = new Map<string, NoteIn[]>();
  function arrangedFrom(s: State): NoteIn[] {
    const tune = chosenTune(s);
    const key = `${s.song}:${s.tempo}:${s.transpose}:${tune?.title}`;
    let notes = roundNotes.get(key);
    if (!notes) {
      notes = tune ? timed(tune.notes, s.tempo).map((n) => ({ ...n, midi: n.midi + s.transpose })) : [];
      roundNotes.clear();
      roundNotes.set(key, notes);
    }
    return notes;
  }

  // The line-up is worked out a moment after the controls settle: arranging a long file takes time.
  let planning = 0;
  const PLAN_KEYS = ["song", "imported", "setups", "body", "transpose", "tempo", "shimmer", "lyrics", "singAs"] as const;
  function replan(): void {
    const s = store.get();
    try {
      planned = lineup(s);
    } catch (error) {
      console.error(error);
      planned = null;
    }
    showPlan(store.get());
    if (!s.playing) {
      rollNotes = planned?.notes ?? [];
      roll.show(rollNotes);
      fitWords();
    }
  }
  store.on(PLAN_KEYS, (s, before) => {
    clearTimeout(planning);
    // A new song is planned at once; a slider being dragged or words being typed wait for a pause.
    if (s === before || s.song !== before.song || s.imported !== before.imported || s.setups !== before.setups) replan();
    else planning = window.setTimeout(replan, 250);
  });
  store.on(["playing", "changes", "focus"], (s, before) => {
    showPlan(s);
    if (s.playing !== before.playing || s === before) {
      rollNotes = s.playing?.kind === "sing" ? (s.playing.notes ?? []) : (planned?.notes ?? []);
      roll.show(rollNotes);
      fitWords();
    }
  });

  // A new song, or a new shape of choir, starts with every singer as the arrangement has it.
  store.on(["song", "setups", "imported"], (s, before) => {
    if (s === before) return;
    const a = setupOf(s);
    const b = setupOf(before);
    if (s.song !== before.song || s.imported !== before.imported || a.choir !== b.choir || a.voices !== b.voices || a.style !== b.style) {
      store.set({ changes: {}, focus: -1 });
    }
  });

  // Level, place, mute and solo are heard at once.
  store.on(["changes"], (s) => {
    if (!s.playing || s.playing.kind !== "sing") return;
    liveMix(s.playing, singing, s).forEach((mix, seat) => sound.mix(seat, mix.level, mix.place));
  });

  const controls = el(
    "div.mode-controls",
    {},
    el("div.group.wide", {}, songs.root, el("div.import", {}, browse, picker, ARRANGER_ONLINE ? aiToggle.root : null, ARRANGER_ONLINE ? aiNote : null)),
    fromFile,
    el("div.group.wide", {}, el("h2.group-title", {}, "Voices"), choir.root, voices.root, style.root, story, another),
    el("div.group", {}, el("h2.group-title", {}, "Performance"), singAs.root, transpose.root, tempo.root, shimmer.root, body.root),
    el("div.group.wide", {}, el("h2.group-title", {}, "Arrangement"), bandSection.root, singersSection.root, wordsSection.root),
  );

  /** The seat of the singer shown alone, or the first. */
  const shown = (): number => {
    const s = store.get();
    if (!s.playing || s.focus < 0) return 0;
    return Math.max(0, s.playing.parts.findIndex((part, seat) => (part.line ?? seat) === s.focus));
  };

  return {
    controls,
    surface: el("div.sing-surface", {}, roll.root),
    go: { label: "Sing", act: () => void singNow() },
    shown,
    frame() {
      const s = store.get();
      roll.frame(s.playing?.kind === "sing" ? app.position() : -1, sound.telemetry(shown())[TELEMETRY.f0]);
      singers.frame();
    },
  };
}
