// What a song will be: who sings (the line-up), what the band plays, and then the performance
// itself, each singer's words through sing(). The arranging is the language layer's (arrange()
// for a tune alone, acappella() for a file's own tracks); this decides which to ask, and turns
// the answers into seats and slots. No DOM here.
import { BODIES } from "../../contract.ts";
import type { BandPart, InstrumentId, Score } from "../../contract.ts";
import { KINDS, analyse, arrange, arrangeBand, suggestBand } from "../../lang/arrange.ts";
import type { MeterHint } from "../../lang/arrange.ts";
import { energyAt, heard, lean, lines as stageLines, restsOf, silence, splice, stage, textureAt } from "../../lang/staging.ts";
import { follow } from "../../lang/band-parts.ts";
import { agreement, choices, offerOrder, shapeScore, signature } from "../../lang/critic.ts";
import type { Lean } from "../../lang/staging.ts";
import type { VoiceLine } from "../../lang/arrange.ts";
import { fileArrangement, instrumentFor as fileInstrument } from "../../lang/acappella.ts";
import type { FileArrangement, TrackUse as FileUse } from "../../lang/acappella.ts";
import { sing } from "../../lang/index.ts";
import type { Lang, NoteIn, SongImport } from "../../lang/index.ts";
import type { SongTrack } from "../../lang/song.ts";
import { BODY_NAMES, octavesToFit } from "../bodies.ts";
import { detuneOf, glottisFor, presetById } from "../instrument/presets.ts";
import type { Preset } from "../instrument/presets.ts";
import { clamp } from "../notes.ts";
import { SOLO } from "../save.ts";
import { laScore } from "../scores.ts";
import { atTempo, breathed, captionsAt, choirLines, chosenTune, introOf, plannedNotes, roleName, songById, songClock, syllables, timed } from "../songs.ts";
import type { Song } from "../songs.ts";
import type { Part, Performance, SongCaption, State } from "../state.ts";
import { BAND_SLOTS } from "../audio/packet.ts";
import { instrumentFor, setupOf, trackUse } from "./setup.ts";
import type { SongSetup } from "./setup.ts";

/** How many voices can sing at once. */
const SEATS = 6;

/** One singer of the line-up, before its words are sung. */
export interface Line {
  name: string;
  /** 0 child .. 4 bass. */
  body: number;
  /** The notes it sings, on the performance's clock; empty for mouth drums. */
  notes: NoteIn[];
  lyrics: string;
  /** Already sung (an imported file's parts come from acappella() finished). */
  score?: Score;
  level: number;
  place: number;
  /** It carries the tune. */
  tune: boolean;
  /** Staged: the spans (seconds, on the performance's clock) it rests in; its words there are not sung. */
  rests?: [number, number][];
  /** Staged: the spans it hums in, and on what vowel (IPA). */
  hums?: [number, number][];
  hum?: string;
  /** Staged: the cadence notes it leans into from the note above. */
  leans?: Lean[];
}

export interface Lineup {
  title: string;
  lang: Lang;
  lines: Line[];
  band: BandPart[];
  /** The tune as it will be sung, for the piano roll. */
  notes: NoteIn[];
  /** The choir was asked for but could not be made: why, in a sentence. */
  alone?: string;
  /** The song's own captions, on the performance's clock. */
  captions?: SongCaption[];
  /** Staged: the plan in a line ("Soprano alone · Alto joins · everyone from the third phrase"). */
  story?: string;
  /** Staged: which of the critic's plans this is (0 the best) and how many different ones there are. */
  plans?: { rank: number; count: number };
}

/** Where the voices of a choir stand around the tune, which is in the middle. */
const PLACES = [0, -0.5, 0.5, -0.85, 0.85, 0.25];

const bodyIndex = (name: string): number => Math.max(0, BODY_NAMES.indexOf(name as keyof typeof BODIES));
const moved = (notes: NoteIn[], semitones: number): NoteIn[] => (semitones ? notes.map((n) => ({ ...n, midi: n.midi + semitones })) : notes);

/** The arranger's voices as lines: the tune in front and in the middle, the others quieter and to the sides. */
function arrangedLines(voices: VoiceLine[]): Line[] {
  const tuneFirst = [...voices].sort((a, b) => Number(b.tune) - Number(a.tune)).slice(0, SEATS);
  return tuneFirst.map((v, i) => ({
    name: v.name,
    body: bodyIndex(v.body),
    notes: v.notes,
    lyrics: v.lyrics,
    level: v.tune ? 0.72 : 0.48,
    place: PLACES[i],
    tune: v.tune,
    ...(v.rests ? { rests: v.rests } : {}),
    ...(v.hums ? { hums: v.hums, hum: v.hum } : {}),
    ...(v.leans ? { leans: v.leans } : {}),
  }));
}

const rounds = new WeakMap<NoteIn[], boolean>();

/**
 * Does the arranger make a round of this tune? Asked by trying, and the arranger says whether
 * the tune works as one (its voices overlapping well where they enter).
 */
export function roundWorks(notes: NoteIn[]): boolean {
  const known = rounds.get(notes);
  if (known !== undefined) return known;
  let works = false;
  try {
    const a = arrange(notes, { voices: 4, style: "round", band: [] });
    // The arranger says so; failing a word from it, a round is voices coming in one after another.
    const starts = a.voices.map((v) => v.notes[0]?.t ?? 0);
    works = a.round?.works ?? (a.voices.length >= 2 && Math.max(...starts) - Math.min(...starts) > 0.25);
  } catch {
    works = false;
  }
  rounds.set(notes, works);
  return works;
}

/** An imported file's own time signature, as the arranger takes it: 6/8, 9/8 and 12/8 are beats in three. */
export function meterOf(source: SongImport | undefined | null): MeterHint | undefined {
  const sig = source?.song.timeSignatures?.[0];
  if (!sig) return undefined;
  const compound = sig.denominator === 8 && sig.numerator % 3 === 0 && sig.numerator > 3;
  return compound ? { meter: sig.numerator / 3, division: 3 } : { meter: sig.numerator, division: 2 };
}

/** The instruments a song starts with: its own band's, or else what the arranger suggests for the tune. */
export function suggestedFor(s: State, notes: NoteIn[]): InstrumentId[] {
  return songById(s.song)?.band?.instruments ?? suggested(notes, s.song === "imported" ? meterOf(chosenTune(s)?.source) : undefined);
}

/** Why those instruments, in a few words for the page. */
export function suggestedWhy(s: State, notes: NoteIn[]): string {
  if (songById(s.song)?.band) return "The song’s own band, as it was written";
  try {
    return notes.length ? `Chosen for ${KINDS[analyse(notes, s.song === "imported" ? meterOf(chosenTune(s)?.source) : undefined).character].says}` : "";
  } catch {
    return "";
  }
}

/** The instruments the arranger suggests for this tune, best first. */
export function suggested(notes: NoteIn[], hint?: MeterHint): InstrumentId[] {
  try {
    return notes.length ? suggestBand(analyse(notes, hint)) : [];
  } catch {
    return [];
  }
}

/** The file's other tracks, the ones that have notes. */
export const otherTracks = (source: SongImport) => source.song.tracks.filter((t) => t.notes.length && t.index !== source.melodyTrack);

/** The tune notes a built-in tune is arranged from: on the page's clock, in the key the transpose control asks. */
const tuneNotes = (s: State, notes: NoteIn[]) => moved(timed(notes, s.tempo), s.transpose);

/** The instrument that plays a file's track: the arranger's choice for its program, or failing that the page's. */
export const playedBy = (track: Pick<SongTrack, "program" | "drums">): InstrumentId => fileInstrument(track.program, track.drums) ?? instrumentFor(track);

/** What each of a file's tracks does in the arranger's terms, as the setup and the person ask. */
function choicesFor(source: SongImport, setup: SongSetup): Record<number, FileUse> {
  const choices: Record<number, FileUse> = {};
  for (const t of otherTracks(source)) {
    const use = trackUse(setup, t.index);
    choices[t.index] = use === "sing" && setup.choir ? "sung" : use === "play" && setup.band ? playedBy(t) : "out";
  }
  if (source.melodyTrack !== null) choices[source.melodyTrack] = "sung";
  return choices;
}

/** Who will sing the chosen song and what the band will play, as the state stands. */
export function lineup(s: State): Lineup | null {
  const tune = chosenTune(s);
  if (!tune) return null;
  const setup = setupOf(s);
  const words = s.lyrics ?? tune.lyrics;
  const song = songById(s.song);
  const written = song?.voices?.length ? song : null;
  const source = s.song === "imported" ? (tune.source ?? null) : null;
  const file = source ? atTempo(source, s.tempo) : null;

  // An imported file's own tracks, sung and played as the person chose: the arranger's work.
  let fromFile: FileArrangement | null = null;
  if (file && source) {
    const choices = choicesFor(source, setup);
    const used = Object.entries(choices).some(([track, use]) => Number(track) !== source.melodyTrack && use !== "out");
    if (used) {
      try {
        fromFile = fileArrangement({ ...file, lyrics: words }, { lang: tune.lang, vibrato: s.shimmer, parts: Math.min(5, setup.voices), choices });
      } catch (error) {
        console.error(error);
      }
    }
  }
  // When the file's own tracks play, every singer keeps the file's clock, intro and all.
  const plays = !!fromFile?.band.length;

  let lines: Line[] | null = null;
  let roll: NoteIn[] = [];
  /** Semitones the file's played tracks move: the key the tune is sung in. */
  let bandShift = s.transpose;
  let alone: string | undefined;
  /** Staged: how full the singing is at a time on the tune's clock, for the band; and the plan in words. */
  let energy: ((t: number) => number) | undefined;
  let texture: ((t: number) => "all" | "men" | "women") | undefined;
  let story: string | undefined;
  let plans: { rank: number; count: number } | undefined;
  /** Staged: the beat (seconds), for a file's played tracks to follow the plan. */
  let stageBeat = 0;

  if (setup.choir && written) {
    const choir = choirLines(written, s);
    // a voice with words of its own sings them, unless the person wrote words for the song
    lines = choir.map((line, i) => ({ name: line.name, body: line.body, notes: line.notes, lyrics: s.lyrics ?? line.lyrics ?? words, level: line.level, place: line.place, tune: i === 0 }));
    // a song written out whole passes its tune from voice to voice: the roll shows the tune itself
    roll = written.captions ? breathed(tuneNotes(s, tune.notes), tune.lyrics) : choir[0].notes;
  } else if (setup.choir && file && fromFile && fromFile.parts.length >= 2) {
    // The file's own parts, each in the body its range suits: the arrangement decides, not the controls.
    const parts = [...fromFile.parts].sort((a, b) => Number(b.role === "tune") - Number(a.role === "tune")).slice(0, SEATS);
    const lead = parts.find((part) => part.role === "tune");
    lines = parts.map((part, i) => ({
      name: roleName(part.role, part.body),
      body: bodyIndex(part.body),
      notes: part.role === "tune" ? moved(file.notes, part.transpose) : [],
      lyrics: "",
      score: part.score,
      level: part.role === "tune" ? 0.75 : part.role === "bass" ? 0.55 : 0.42,
      place: PLACES[i],
      tune: part.role === "tune",
    }));
    roll = moved(file.notes, lead?.transpose ?? 0);
    bandShift = 0;
    if (setup.style === "staged") {
      // The file's parts staged as an arranged choir's: the tune alone, then its harmony, its
      // pads, its bass, and its drums once everyone sings. They are sung already (on vowels and
      // "dum"), so they come in and rest; they do not hum.
      const ENTRY = ["tune", "harmony", "pad", "bass", "drums"];
      const order = parts.map((_, i) => i).sort((x, y) => ENTRY.indexOf(parts[x].role) - ENTRY.indexOf(parts[y].role));
      const a = analyse(roll);
      const bar = a.beat * a.meter;
      const units = stageLines(roll, a.phrases, 4 * bar + 1e-3, 2 * bar - 1e-3);
      const names = order.map((i) => lines![i].name);
      // the critic judges these plans by their shape alone: the file's parts are sung already
      const seen = new Set<string>();
      const tried = choices(names.length)
        .map((choice) => ({ choice, plan: stage(roll, units, names, { ...choice, hum: false }) }))
        .filter(({ plan }) => !seen.has(signature(plan)) && !!seen.add(signature(plan)))
        .map(({ choice, plan }) => ({ staging: plan, score: shapeScore(plan, names, a.tempo <= 100) + 1.2 * agreement(choice, setup.prefer, names) }));
      const offered = offerOrder(tried);
      const rank = (((setup.variant ?? 0) % offered.length) + offered.length) % offered.length;
      const staging = offered[rank].staging;
      plans = { rank, count: offered.length };
      order.forEach((i, entry) => {
        const rests = restsOf(staging, entry);
        if (rests.length) lines![i] = { ...lines![i], rests };
      });
      energy = (t) => energyAt(staging, t);
      texture = (t) => textureAt(staging, t);
      story = staging.story;
      stageBeat = a.beat;
    }
  }
  if (!lines && setup.choir) {
    // A tune alone (built in, or a file with nothing else to sing): the arranger writes the parts.
    const notes = file && plays ? moved(file.notes, s.transpose) : tuneNotes(s, tune.notes);
    try {
      const style = setup.style === "round" && !roundWorks(notes) ? "hymn" : setup.style;
      const a = arrange(notes, { voices: setup.voices, style, band: [], lyrics: words, variant: setup.variant ?? 0, prefer: setup.prefer });
      if (a.voices.length >= 2) {
        lines = arrangedLines(a.voices);
        roll = lines.find((line) => line.tune)?.notes ?? notes;
        if (a.staging) {
          const staging = a.staging;
          energy = (t) => energyAt(staging, t);
          texture = (t) => textureAt(staging, t);
          story = staging.story;
          plans = a.plans;
          stageBeat = a.analysis.beat;
        }
      }
    } catch (error) {
      console.error(error);
    }
    if (!lines) alone = "The parts could not be arranged, so the tune is sung alone.";
  }
  if (!lines) {
    // One voice: the tune where this body sings it, on the file's clock if the file's tracks play with it.
    let notes = plannedNotes(tune, s);
    if (file && plays) {
      const pitches = file.notes.map((n) => n.midi);
      notes = moved(file.notes, octavesToFit(Math.min(...pitches), Math.max(...pitches), s.body) + s.transpose);
    }
    // a song written out whole breathes where its lines end, as its choir does
    if (song?.captions && s.lyrics === null) notes = breathed(notes, tune.lyrics);
    lines = [{ name: "", body: s.body, notes, lyrics: words, level: SOLO.level, place: SOLO.place, tune: true }];
    roll = notes;
  }

  // ── the band: what the arranger writes for the ticked instruments, and the file's played tracks ──
  const band: BandPart[] = [];
  /** Seconds the band's introduction holds the voices back. */
  let delay = 0;
  const own = setup.band && !source ? ownBand(song, setup.instruments) : null;
  if (own) {
    // the song's own band, its introduction and all; any other instrument ticked is the arranger's
    delay = introOf(own.song, s.tempo);
    const clock = songClock(own.song, s.tempo, delay);
    const later = (notes: NoteIn[]) => notes.map((n) => ({ ...n, t: n.t + delay }));
    lines = lines.map((line) => ({ ...line, notes: later(line.notes) }));
    roll = later(roll);
    for (const part of own.song.band!.parts(clock)) {
      if (!own.ids.includes(part.instrument)) continue;
      // moved with the voices by the transpose control (the tabla keeps its strokes)
      band.push(part.instrument === "tabla" || !s.transpose ? part : { ...part, notes: part.notes.map((n) => ({ ...n, midi: n.midi + s.transpose })) });
    }
    const others = own.ids.filter((id) => !own.song.band!.instruments.includes(id));
    if (others.length) {
      try {
        band.push(...arrangeBand(roll, lines.map((line) => line.notes), others, { intro: false }).band.filter((part) => others.includes(part.instrument)));
      } catch (error) {
        console.error(error);
      }
    }
  } else if (setup.band) {
    const ids = setup.instruments ?? (song?.band?.instruments ? song.band.instruments : suggested(roll, meterOf(source)));
    if (ids.length && roll.length) {
      try {
        // The band plays the chords every singer sings together. It opens with the tune's last
        // phrase, unless a file's own tracks or parts already sung set the clock.
        const intro = !plays && lines.every((line) => !line.score);
        const planned = arrangeBand(roll, lines.map((line) => heard(line.notes, line.rests ?? [])), ids, { intro, energy, texture });
        band.push(...planned.band.filter((part) => ids.includes(part.instrument)));
        if (planned.delay > 0) {
          delay = planned.delay;
          const later = (notes: NoteIn[]) => notes.map((n) => ({ ...n, t: n.t + planned.delay }));
          const span = ([a, b]: [number, number]): [number, number] => [a + planned.delay, b + planned.delay];
          lines = lines.map((line) => ({
            ...line,
            notes: later(line.notes),
            ...(line.rests ? { rests: line.rests.map(span) } : {}),
            ...(line.hums ? { hums: line.hums.map(span) } : {}),
            ...(line.leans ? { leans: line.leans.map((l) => ({ ...l, t: l.t + planned.delay })) } : {}),
          }));
          roll = later(roll);
        }
      } catch (error) {
        console.error(error);
      }
    }
    for (const part of fromFile?.band ?? []) {
      // Moved with the tune by the transpose control (drums keep their pieces); staged, each
      // plays in the phrases its family belongs to.
      const shift = part.instrument === "kit" || part.instrument === "tabla" ? 0 : bandShift;
      let notes = shift ? part.notes.map((n) => ({ ...n, midi: n.midi + shift })) : part.notes;
      if (stageBeat) notes = follow(notes, part.instrument, stageBeat, energy, texture);
      band.push({ ...part, notes });
    }
  }
  band.splice(BAND_SLOTS);

  // the song's own captions follow its words as written, on the clock its voices sing to
  const captions = song?.captions && s.lyrics === null ? captionsAt(song.captions, songClock(song, s.tempo, delay)) : undefined;
  return { title: tune.title, lang: tune.lang, lines, band, notes: roll, alone, ...(captions ? { captions } : {}), ...(story ? { story } : {}), ...(plans ? { plans } : {}) };
}

/** A song's own band, when it has one and at least one of its instruments is ticked (or none was chosen): the song, and the instruments that play. */
function ownBand(song: Song | undefined, chosen: InstrumentId[] | null): { song: Song; ids: InstrumentId[] } | null {
  if (!song?.band) return null;
  const ids = chosen ?? song.band.instruments;
  return ids.some((id) => song.band!.instruments.includes(id)) ? { song, ids } : null;
}

/** One seat of a performance: which line it sings, and how. */
export interface SeatPlan {
  line: number;
  body: number;
  level: number;
  place: number;
  /** Semitones its notes move: the singer's octave and the voice's preset. */
  shift: number;
  /** Cents it sits off the others singing the same line. */
  cents: number;
  size: number;
}

/**
 * The seats: each line once, or several times in unison when the voice chosen is a preset that
 * sings so (as many as six seats allow). Muted singers keep their seat at no level, so they can
 * be heard again while the song goes on.
 */
export function seatsOf(lines: readonly Line[], s: Pick<State, "changes" | "singAs">): SeatPlan[] {
  const preset: Preset | null = s.singAs === "own" ? null : presetById(s.singAs);
  const count = Math.min(SEATS, lines.length);
  const unison = preset ? clamp(Math.min(preset.tone.unison, Math.floor(SEATS / Math.max(1, count))), 1, SEATS) : 1;
  const soloed = Object.values(s.changes).some((c) => c?.solo);
  const seats: SeatPlan[] = [];
  for (let i = 0; i < count; i++) {
    const line = lines[i];
    const c = s.changes[i] ?? {};
    const heard = !c.mute && (!soloed || !!c.solo);
    // Voices in unison add up: each is quieter so the line is as loud as one voice was, a little more.
    const level = heard ? (c.level ?? line.level) / unison ** 0.6 : 0;
    const base = c.place ?? line.place;
    const width = (count === 1 ? 1 : 0.25) * (preset?.tone.spread ?? 0);
    for (let k = 0; k < unison; k++) {
      seats.push({
        line: i,
        body: c.body ?? line.body,
        level,
        place: clamp(base + (unison > 1 ? width * (2 * (k / (unison - 1)) - 1) : 0), -1, 1),
        shift: 12 * ((c.octave ?? 0) + (preset?.tone.octave ?? 0)),
        cents: detuneOf(k, unison, preset?.tone.detune ?? 0),
        size: preset?.tone.size ?? 1,
      });
    }
  }
  return seats;
}

/** A score moved by a number of semitones (fractional for cents): its pitch line scaled. */
export function pitched(score: Score, semitones: number): Score {
  if (!semitones) return score;
  const k = 2 ** (semitones / 12);
  return { ...score, pitch: score.pitch.map((p) => ({ t: p.t, v: p.v * k })) };
}

/** Sing a line's words on its notes; on "la" if the words do not come back. */
function voiceLine(line: Line, lang: Lang, vibrato: number, shift: number, said: string[]): Score {
  if (line.score) return line.rests?.length ? silence(pitched(line.score, shift), line.rests) : pitched(line.score, shift);
  // Staged: the whole song is sung, so every word keeps its note; then the phrases it hums are
  // sung again on a vowel and put in their place, its cadences lean, and its rests are cut out.
  let score = voiceWhole(line, lang, vibrato, shift, said);
  if (line.hums?.length) {
    const inHum = (n: NoteIn) => line.hums!.some(([a, b]) => n.t + n.d / 2 >= a && n.t + n.d / 2 < b);
    // one vowel to each change of pitch: a held chord note is one long "ooh", a breath at each phrase
    const hummed: NoteIn[] = [];
    const phrase: number[] = [];
    for (const n of moved(line.notes, shift).filter(inHum)) {
      const last = hummed[hummed.length - 1];
      const window = line.hums.findIndex(([a, b]) => n.t + n.d / 2 >= a && n.t + n.d / 2 < b);
      if (last && last.midi === n.midi && Math.abs(last.t + last.d - n.t) < 1e-6 && phrase[phrase.length - 1] === window) last.d += n.d;
      else {
        hummed.push({ ...n });
        phrase.push(window);
      }
    }
    const words = line.hums.map((_, w) => phrase.filter((p) => p === w).map(() => line.hum ?? "u").join(" ")).filter(Boolean).join("\n");
    try {
      score = splice(score, sing(hummed, words, { lang: "ipa", vibrato, transpose: 0 }), line.hums);
    } catch (error) {
      console.error(error);
    }
  }
  if (line.leans?.length) score = lean(score, line.leans.map((l) => ({ ...l, midi: l.midi + shift, from: l.from + shift })));
  return line.rests?.length ? silence(score, line.rests) : score;
}

function voiceWhole(line: Line, lang: Lang, vibrato: number, shift: number, said: string[]): Score {
  const notes = moved(line.notes, shift);
  let score: Score = { phones: [], pitch: [], length: 0 };
  try {
    // The notes are already in their final key, so sing() is asked for no transposition of its own.
    score = sing(notes, line.lyrics, { lang, vibrato, transpose: 0 });
  } catch (error) {
    console.error(error);
  }
  if (!score.phones.length && notes.length) {
    score = laScore(notes, syllables(line.lyrics), vibrato);
    said.push("The words did not come back, so the tune is sung on “la”.");
  }
  return score;
}

/** The performance a line-up makes, and anything worth saying about how it went. */
export function performance(lu: Lineup, s: State): { performance: Performance; said: string[] } {
  const said: string[] = lu.alone ? [lu.alone] : [];
  const preset = s.singAs === "own" ? null : presetById(s.singAs);
  const vibrato = preset ? preset.tone.vibrato : s.shimmer;
  const sung = new Map<string, Score>();
  const parts = seatsOf(lu.lines, s).map((seat): Part => {
    const line = lu.lines[seat.line];
    const key = `${seat.line}:${seat.shift}`;
    let score = sung.get(key);
    if (!score) {
      score = voiceLine(line, lu.lang, vibrato, seat.shift, said);
      // A falsetto preset sings the whole song in its register.
      if (preset?.pose?.register !== undefined) score = { ...score, register: [{ t: 0, v: preset.pose.register }] };
      // And in its voice quality: a whisper, breathy or pressed preset sings the song that way.
      if (preset) score = { ...score, glottis: [{ t: 0, v: glottisFor(preset.tone.noise) }] };
      sung.set(key, score);
    }
    return {
      score: pitched(score, seat.cents / 100),
      body: seat.body,
      level: seat.level,
      place: seat.place,
      name: line.name || undefined,
      size: seat.size === 1 ? undefined : seat.size,
      line: seat.line,
    };
  });
  return {
    performance: { kind: "sing", title: lu.title, parts, notes: lu.notes, band: lu.band.length ? lu.band : undefined, ...(lu.captions ? { captions: lu.captions } : {}) },
    said: [...new Set(said)],
  };
}

/** The level and place each seat of a performance should have now, after the person's changes (live: mute, solo, level, place). */
export function liveMix(performance: Performance, lines: readonly Line[], s: Pick<State, "changes" | "singAs">): { level: number; place: number }[] {
  const plan = seatsOf(lines, s);
  return performance.parts.map((part, seat) => plan[seat] ?? { level: part.level, place: part.place });
}
