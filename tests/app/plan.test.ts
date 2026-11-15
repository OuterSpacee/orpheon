// Who sings a song and what the band plays: each song's own setup, the line-up, the seats, the
// performance, the links that carry them; and the Instrument mode's presets and voicing.
import "../fixtures/plain-songs.ts";
import { beforeAll, describe, expect, test } from "bun:test";
import { POSE_KEYS } from "../../src/contract.ts";
import type { Pose } from "../../src/contract.ts";
import { importSong, ready } from "../../src/lang/index.ts";
import { createVoice } from "../../src/voice/index.ts";
import { sizedBody } from "../../src/app/bodies.ts";
import { poseOf } from "../../src/app/instrument/player.ts";
import { PRESETS, TONE_RANGE, detuneOf, glottisFor, presetById } from "../../src/app/instrument/presets.ts";
import { assign, unisonOf } from "../../src/app/instrument/voicing.ts";
import { decodeLink, encodeLink } from "../../src/app/link.ts";
import { tuneFrom } from "../../src/app/sing/import.ts";
import { lineup, liveMix, performance, pitched, seatsOf } from "../../src/app/sing/plan.ts";
import type { Line } from "../../src/app/sing/plan.ts";
import { defaultSetup, instrumentFor, setupOf, setupPatch, trackUse } from "../../src/app/sing/setup.ts";
import { VOWEL_GUESS } from "../../src/app/scores.ts";
import { INITIAL, lengthOf } from "../../src/app/state.ts";
import type { State } from "../../src/app/state.ts";
import { TWINKLE, inTicks, line, note, program, smf, tempo, track, trackName } from "../lang/smf.ts";

const state = (patch: Partial<State>): State => ({ ...INITIAL, mode: "sing", ...patch });

beforeAll(async () => {
  await ready("en");
});

/** A file with a tune, a bass line on a bass's program, and a drum track. */
function threeTracks() {
  const q = 480;
  const bass: [number, number][] = TWINKLE.map(([m, l]) => [m - 24, l]);
  const drums = Array.from({ length: 12 }, (_, i) => note(i * q * 2, q / 2, 9, i % 2 ? 38 : 36)).flat();
  const bytes = smf(1, q, [
    track([tempo(0, 120)]),
    track([trackName("Tune"), program(0, 0, 0), ...line(0, inTicks(TWINKLE, q))]),
    track([trackName("Bass"), program(0, 1, 33), ...line(1, inTicks(bass, q))]),
    track([trackName("Drums"), ...drums]),
  ]);
  const song = importSong(bytes, { lang: "en" });
  return tuneFrom(song, "three.mid", "en")!;
}

describe("each song's setup", () => {
  test("a song written for a choir starts as one; any other starts alone, with no band", () => {
    expect(defaultSetup("jacques").choir).toBe(true);
    expect(defaultSetup("old100").choir).toBe(true);
    expect(defaultSetup("twinkle")).toEqual({ choir: false, voices: 4, style: "staged", band: false, instruments: null, tracks: {} });
  });

  test("changing one song's setup leaves every other song's as it was", () => {
    const s = state({ song: "twinkle" });
    const one = { ...s, ...setupPatch(s, { choir: true, voices: 3 }) };
    const two = { ...one, song: "plain-grace", ...setupPatch({ ...one, song: "plain-grace" }, { band: true }) };
    expect(setupOf({ ...two, song: "twinkle" })).toMatchObject({ choir: true, voices: 3, band: false });
    expect(setupOf({ ...two, song: "plain-grace" })).toMatchObject({ choir: false, band: true });
    expect(setupOf({ ...two, song: "joy" })).toEqual(defaultSetup("joy"));
  });

  test("a file's track is sung with the choir on, played with only the band on, else left out, unless the person said", () => {
    const off = defaultSetup("imported");
    expect(trackUse(off, 2)).toBe("out");
    expect(trackUse({ ...off, band: true }, 2)).toBe("play");
    expect(trackUse({ ...off, band: true, choir: true }, 2)).toBe("sing");
    expect(trackUse({ ...off, choir: true, tracks: { 2: "out" } }, 2)).toBe("out");
  });

  test("a track is played by the instrument of its General MIDI family", () => {
    expect(instrumentFor({ program: 0, drums: false })).toBe("piano");
    expect(instrumentFor({ program: 25, drums: false })).toBe("guitar");
    expect(instrumentFor({ program: 33, drums: false })).toBe("bass");
    expect(instrumentFor({ program: 48, drums: false })).toBe("strings");
    expect(instrumentFor({ program: 46, drums: false })).toBe("harp");
    expect(instrumentFor({ program: 73, drums: false })).toBe("flute");
    expect(instrumentFor({ program: 47, drums: false })).toBe("timpani");
    expect(instrumentFor({ program: null, drums: true })).toBe("kit");
    expect(instrumentFor({ program: null, drums: false })).toBe("piano");
  });
});

describe("the line-up", () => {
  test("a tune alone is one singer in the body the control sets; a song written for a choir is its voices", () => {
    expect(lineup(state({ song: "twinkle", body: 1 }))!.lines.map((l) => l.body)).toEqual([1]);
    const round = lineup(state({ song: "jacques" }))!;
    expect(round.lines.map((l) => l.name)).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    // The round's voices come in one after another.
    expect(round.lines[1].notes[0].t).toBeGreaterThan(round.lines[0].notes[0].t + 1);
  });

  test("with its choir ticked off, a song written for a choir is sung by one head", () => {
    const s = state({ song: "old100" });
    const lu = lineup({ ...s, ...setupPatch(s, { choir: false }) })!;
    expect(lu.lines.length).toBe(1);
  });

  test("with the band off nothing plays; with it on, only instruments that were ticked, at most eight", () => {
    const s = state({ song: "twinkle" });
    expect(lineup(s)!.band).toEqual([]);
    const lu = lineup({ ...s, ...setupPatch(s, { band: true, instruments: ["bass", "piano"] }) })!;
    expect(lu.band.length).toBeLessThanOrEqual(8);
    for (const part of lu.band) expect(["bass", "piano"]).toContain(part.instrument);
  });

  test("a file's tracks: the choir sings them, or the band plays them in time with the tune, or they are left out", () => {
    const tune = threeTracks();
    const s = state({ song: "imported", imported: tune });
    const choir = lineup({ ...s, ...setupPatch(s, { choir: true }) })!;
    expect(choir.lines.length).toBeGreaterThanOrEqual(2);
    expect(choir.lines[0].tune).toBe(true);
    expect(choir.band).toEqual([]);

    const played = lineup({ ...s, ...setupPatch(s, { band: true, instruments: [] }) })!;
    expect(played.lines.length).toBe(1);
    expect(played.band.map((p) => p.instrument).sort()).toEqual(["bass", "kit"]);
    const bass = played.band.find((p) => p.instrument === "bass")!;
    // The bass's first note and the tune's first note started together in the file; they still do.
    expect(bass.notes[0].t).toBeCloseTo(played.lines[0].notes[0].t, 6);
    expect(bass.notes.length).toBe(TWINKLE.length);

    const someOut = lineup({ ...s, ...setupPatch(s, { band: true, instruments: [], tracks: { 3: "out" } }) })!;
    expect(someOut.band.map((p) => p.instrument)).toEqual(["bass"]);
  });
});

describe("the seats", () => {
  const lines: Line[] = [
    { name: "Tune", body: 1, notes: [], lyrics: "", level: 0.7, place: 0, tune: true },
    { name: "Bass", body: 4, notes: [], lyrics: "", level: 0.5, place: -0.5, tune: false },
  ];

  test("each line once with its own voice; a preset that sings in unison fills the seats it can", () => {
    expect(seatsOf(lines, { changes: {}, singAs: "own" }).map((x) => x.line)).toEqual([0, 1]);
    const pad = seatsOf(lines, { changes: {}, singAs: "pad" });
    // Four in unison would be eight seats: three each fit in six.
    expect(pad.map((x) => x.line)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(new Set(pad.slice(0, 3).map((x) => x.cents)).size).toBe(3);
    const alone = seatsOf([lines[0]], { changes: {}, singAs: "pad" });
    expect(alone.length).toBe(4);
    expect(Math.min(...alone.map((x) => x.place))).toBeLessThan(-0.5);
  });

  test("a muted singer keeps its seat at no level; a soloed one silences the rest", () => {
    const muted = seatsOf(lines, { changes: { 1: { mute: true } }, singAs: "own" });
    expect(muted.map((x) => x.level)).toEqual([0.7, 0]);
    const solo = seatsOf(lines, { changes: { 1: { solo: true } }, singAs: "own" });
    expect(solo.map((x) => x.level)).toEqual([0, 0.5]);
  });

  test("a singer's body, octave, level and place are the person's once changed", () => {
    const [, bass] = seatsOf(lines, { changes: { 1: { body: 3, octave: 1, level: 0.2, place: 0.9 } }, singAs: "own" });
    expect(bass).toMatchObject({ body: 3, shift: 12, level: 0.2, place: 0.9 });
  });

  test("a score is moved by its pitch line", () => {
    const score = { phones: [], pitch: [{ t: 0, v: 100 }], length: 1 };
    expect(pitched(score, 12).pitch[0].v).toBeCloseTo(200, 6);
    expect(pitched(score, 0)).toBe(score);
  });
});

describe("the performance", () => {
  test("a choir song with its band: a part for each voice, the band beside it, and the length covers both", () => {
    const s = state({ song: "jacques" });
    const withBand = { ...s, ...setupPatch(s, { band: true }) };
    const lu = lineup(withBand)!;
    const made = performance(lu, withBand).performance;
    expect(made.parts.length).toBe(4);
    expect(made.parts.every((p) => p.score.phones.length > 0)).toBe(true);
    expect(made.parts.map((p) => p.line)).toEqual([0, 1, 2, 3]);
    expect(made.band ?? []).toEqual(lu.band);
    expect(lengthOf(made)).toBeGreaterThanOrEqual(Math.max(...made.parts.map((p) => p.score.length)));
  });

  test("sung by a preset: its unison, its register and its airway", () => {
    const s = state({ song: "twinkle", singAs: "falsetto" });
    const made = performance(lineup(s)!, s).performance;
    expect(made.parts.length).toBe(1);
    expect(made.parts[0].score.register).toEqual([{ t: 0, v: 1 }]);
    const giant = state({ song: "twinkle", singAs: "giant" });
    expect(performance(lineup(giant)!, giant).performance.parts[0].size).toBe(1.5);
    const pad = state({ song: "twinkle", singAs: "pad" });
    const padParts = performance(lineup(pad)!, pad).performance.parts;
    expect(padParts.length).toBe(4);
    // Detuned: the unison voices' pitches differ by a few cents.
    const first = padParts.map((p) => p.score.pitch[0].v);
    expect(Math.max(...first) / Math.min(...first)).toBeGreaterThan(1.005);
  });

  test("a change of level or mute is heard at once, in the order of the seats", () => {
    const s = state({ song: "old100" });
    const lu = lineup(s)!;
    const made = performance(lu, s).performance;
    const mix = liveMix(made, lu.lines, { ...s, changes: { 2: { mute: true }, 0: { level: 0.1 } } });
    expect(mix.length).toBe(4);
    expect(mix[2].level).toBe(0);
    expect(mix[0].level).toBe(0.1);
    expect(mix[1].level).toBe(made.parts[1].level);
  });
});

describe("the link", () => {
  test("carries a song's choir, band, band level and voice, and only what differs from how the song starts", () => {
    const s = state({ song: "twinkle" });
    const set = { ...s, ...setupPatch(s, { choir: true, voices: 5, style: "oohs", band: true, instruments: ["bass", "harp"] }), bandLevel: 0.4, singAs: "hum" };
    const link = encodeLink(set);
    expect(link).toContain("choir=1");
    expect(link).toContain("band=bass.harp");
    const back = decodeLink(link);
    expect(back.setups).toEqual({ twinkle: { choir: true, voices: 5, style: "oohs", band: true, instruments: ["bass", "harp"] } });
    expect(back.bandLevel).toBe(0.4);
    expect(back.singAs).toBe("hum");
    // A fresh song writes none of it.
    expect(encodeLink(state({ song: "jacques" }))).toBe("mode=sing&song=jacques");
    // The arranger's own suggestions travel as such, not as a list.
    expect(decodeLink(encodeLink({ ...s, ...setupPatch(s, { band: true }) })).setups).toEqual({ twinkle: { band: true, instruments: null } });
  });

  test("carries the Instrument mode's preset and whatever of its tone was changed", () => {
    const tone = { ...presetById("ooh").tone, detune: 33, octave: -1 };
    const link = encodeLink({ ...INITIAL, mode: "instrument", preset: "ooh", tone });
    expect(link).toBe("mode=instrument&preset=ooh&detune=33&octave=-1");
    expect(decodeLink(link)).toMatchObject({ mode: "instrument", preset: "ooh", tone });
  });

  test("believes nothing a stranger typed", () => {
    const back = decodeLink("mode=sing&song=twinkle&voices=99&style=polka&band=bass.banjo.%3Cb%3E&as=nobody&bandlevel=7&preset=x&size=40&unison=-3");
    expect(back.setups).toEqual({ twinkle: { voices: 6, band: true, instruments: ["bass"] } });
    expect(back.singAs).toBeUndefined();
    expect(back.bandLevel).toBe(1);
    expect(back.preset).toBeUndefined();
    expect(back.tone).toMatchObject({ size: 1.5, unison: 1 });
  });
});

describe("the Instrument mode's voices", () => {
  test("a chord keeps its voices when another key goes down; each note gets the unison that fits", () => {
    let seats = assign(new Array(6).fill(null), [60], 3);
    expect(seats).toEqual([60, 60, 60, null, null, null]);
    seats = assign(seats, [60, 64], 3);
    expect(seats).toEqual([60, 60, 60, 64, 64, 64]);
    // A third note: two voices each, and C keeps the seats it had.
    seats = assign(seats, [60, 64, 67], 3);
    expect(seats.filter((n) => n === 60).length).toBe(2);
    expect(seats[0]).toBe(60);
    expect(seats.filter((n) => n === 67).length).toBe(2);
    // Six notes, one voice each; a seventh takes the place of the oldest.
    expect(new Set(assign(seats, [60, 62, 64, 65, 67, 69], 3)).size).toBe(6);
    expect(assign(seats, [60, 62, 64, 65, 67, 69, 71], 1)).not.toContain(60);
    expect(assign(seats, [], 3)).toEqual(new Array(6).fill(null));
  });

  test("the unison voices of a note know their place among each other, and are spread in pitch around it", () => {
    const seats = [60, 64, 60, null, 60, 64];
    expect(unisonOf(seats, 4)).toEqual({ index: 2, count: 3 });
    expect(unisonOf(seats, 1)).toEqual({ index: 0, count: 2 });
    expect([0, 1, 2].map((i) => detuneOf(i, 3, 20))).toEqual([-10, 0, 10]);
    expect(detuneOf(0, 1, 20)).toBe(0);
  });

  test("every preset's tone is inside the controls' ranges, and its pose inside the body's", () => {
    for (const preset of PRESETS) {
      for (const key in TONE_RANGE) {
        const [low, high] = TONE_RANGE[key as keyof typeof TONE_RANGE];
        const v = preset.tone[key as keyof typeof TONE_RANGE];
        expect(v).toBeGreaterThanOrEqual(low);
        expect(v).toBeLessThanOrEqual(high);
      }
      const pose = poseOf(preset.tone, preset, VOWEL_GUESS, 57, 5, 1, 1, 3.3);
      for (const key of POSE_KEYS) {
        const v = pose[key as keyof Pose];
        if (v === undefined || key === "pitch" || key === "vibrato" || key === "lungs" || key === "larynx") continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test("the presets hold the body as they say: a whisper's folds apart, a hum through the nose, falsetto's register", () => {
    const at = (id: string) => poseOf(presetById(id).tone, presetById(id), VOWEL_GUESS, 57, 0, 1, 1, 0);
    expect(at("whisper").glottis).toBeGreaterThan(0.9);
    expect(at("pressed").glottis).toBeLessThan(0.3);
    expect(at("hum")).toMatchObject({ lips: 0, velum: 1 });
    expect(at("falsetto").register).toBe(1);
    expect(glottisFor(0.36)).toBeCloseTo(0.5, 2);
    // Overtone singing sweeps the tongue.
    const overtone = presetById("overtone");
    expect(poseOf(overtone.tone, overtone, VOWEL_GUESS, 57, 0, 1, 1, 0).tongueX).toBeCloseTo(0.45, 6);
    expect(poseOf(overtone.tone, overtone, VOWEL_GUESS, 57, 0, 1, 1, 3.5).tongueX).toBeCloseTo(0.88, 6);
    // Silent at the start of its swell.
    expect(at("aah").lungs).toBeGreaterThan(0);
    expect(poseOf(presetById("aah").tone, presetById("aah"), VOWEL_GUESS, 57, 0, 0, 1, 0).lungs).toBe(0);
  });

  for (const rate of [16000, 48000]) {
    test(`at ${rate} Hz a giant and a tiny still sing, without a sample that is not a number`, () => {
      for (const [body, size] of [[4, 1.5], [0, 0.6]] as const) {
        const voice = createVoice(rate, sizedBody(body, size));
        const preset = presetById(size > 1 ? "giant" : "tiny");
        voice.aim(poseOf(preset.tone, preset, VOWEL_GUESS, size > 1 ? 40 : 76, 0, 1, 1, 0));
        const block = new Float32Array(256);
        let peak = 0;
        let finite = true;
        for (let i = 0; i < Math.ceil((0.6 * rate) / 256); i++) {
          voice.render(block);
          for (const x of block) {
            if (!Number.isFinite(x)) finite = false;
            peak = Math.max(peak, Math.abs(x));
          }
        }
        expect(finite).toBe(true);
        expect(peak).toBeGreaterThan(0.01);
      }
    });
  }
});

describe("a staged choir, as the page sings it", () => {
  test("the joining voices hum on a vowel with no words, the tune leans into its cadences, the resting voices are silent", () => {
    // (old100 and jacques sing their own written parts; grace is arranged)
    const s = state({ song: "plain-grace" });
    const set = { ...s, ...setupPatch(s, { choir: true, voices: 4, style: "staged", band: false }) };
    const lu = lineup(set)!;
    expect(lu.story).toContain("Soprano alone");
    const { performance: p } = performance(lu, set);
    const alto = lu.lines.findIndex((l) => l.name === "Alto");
    const hums = lu.lines[alto].hums!;
    expect(hums.length).toBeGreaterThan(0);
    const score = p.parts.find((part) => part.line === alto)!.score;
    const mid = (x: { t: number; d: number }) => x.t + x.d / 2;
    const inHum = (t: number) => hums.some(([a, b]) => t >= a && t < b);
    const hummed = score.phones.filter((ph) => ph.ph !== "_" && inHum(mid(ph)));
    expect(hummed.length).toBeGreaterThan(0);
    expect(hummed.every((ph) => ph.ph === "u")).toBe(true);
    expect((score.words ?? []).some((w) => inHum(mid(w)))).toBe(false);
    // nothing sung in its rests but the first sounds of a word it keeps
    for (const [a, b] of lu.lines[alto].rests ?? []) expect(score.phones.filter((ph) => ph.ph !== "_" && mid(ph) >= a && mid(ph) < b && !(score.words ?? []).some((w) => mid(ph) >= w.t && mid(ph) <= w.t + w.d)).length).toBe(0);
    const tune = lu.lines.find((l) => l.tune)!;
    expect(tune.leans!.length).toBeGreaterThan(0);
  });
});

describe("a file's own parts, staged", () => {
  test("its tune alone first, its other sung parts coming in, its drums last; as the file has it when not staged", () => {
    const tune = threeTracks();
    const s = state({ song: "imported", imported: tune });
    const lu = lineup({ ...s, ...setupPatch(s, { choir: true }) })!;
    expect(lu.story).toBeTruthy();
    const first = lu.lines.find((l) => l.tune)!;
    expect(first.rests).toBeUndefined();
    const others = lu.lines.filter((l) => !l.tune);
    expect(others.length).toBeGreaterThan(0);
    for (const l of others) expect(l.rests?.length ?? 0).toBeGreaterThan(0);
    // the tune is sung alone at the start: every other part rests through its first notes
    const start = first.notes[0].t;
    for (const l of others) expect(l.rests!.some(([a, b]) => a <= start + 1e-6 && start < b)).toBe(true);
    // and a resting part's score is silent there
    const { performance: p } = performance(lu, { ...s, ...setupPatch(s, { choir: true }) });
    const part = p.parts.find((x) => x.line === lu.lines.indexOf(others[0]))!;
    const [a, b] = others[0].rests![0];
    expect(part.score.phones.filter((ph) => ph.ph !== "_" && ph.t + ph.d / 2 >= a && ph.t + ph.d / 2 < b).length).toBe(0);

    const plain = lineup({ ...s, ...setupPatch(s, { choir: true, style: "hymn" }) })!;
    expect(plain.lines.every((l) => !l.rests)).toBe(true);
  });

  test("its played drums wait for the whole choir; its bass plays from the start", () => {
    const tune = threeTracks();
    const s = state({ song: "imported", imported: tune });
    const set = { ...s, ...setupPatch(s, { choir: true, band: true, instruments: [], tracks: { [tune.source!.song.tracks.find((t) => t.name === "Drums")!.index]: "play", [tune.source!.song.tracks.find((t) => t.name === "Bass")!.index]: "play" } }) };
    const lu = lineup(set)!;
    const drums = lu.band.find((p) => p.instrument === "kit");
    const bass = lu.band.find((p) => p.instrument === "bass");
    expect(bass && drums).toBeTruthy();
    const start = lu.lines.find((l) => l.tune)!.notes[0].t;
    expect(Math.min(...bass!.notes.map((n) => n.t))).toBeLessThan(start + 1);
    expect(Math.min(...drums!.notes.map((n) => n.t))).toBeGreaterThan(start + 2);
  });
});

describe("Try another", () => {
  test("the setup's variant gives another plan, and a link carries it", () => {
    const s = state({ song: "plain-adeste" });
    const one = lineup({ ...s, ...setupPatch(s, { choir: true }) })!;
    const two = lineup({ ...s, ...setupPatch(s, { choir: true, variant: 1 }) })!;
    expect(one.plans).toEqual({ rank: 0, count: one.plans!.count });
    expect(two.plans!.rank).toBe(1);
    expect(two.story).not.toBe(one.story);
    const set = { ...s, ...setupPatch(s, { choir: true, variant: 3 }) };
    const back = decodeLink(encodeLink(set));
    expect(back.setups?.["plain-adeste"]?.variant).toBe(3);
  });
});
