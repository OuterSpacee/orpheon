// Staging: a song's shape. The tune alone first, the voices coming in one by one, everyone by
// about the middle and to the end; a lighter phrase on a new strain in a long song; the band
// growing with it. Every word stays on its note: a resting phrase is cut out of the sung score.
import "../fixtures/plain-songs.ts";
import { beforeAll, describe, expect, test } from "bun:test";
import { SONGS, songTune, timed } from "../../src/app/songs.ts";
import { arrange, arrangeBand } from "../../src/lang/arrange.ts";
import { ready, sing } from "../../src/lang/index.ts";
import { energyAt, form, heard, lean, lines, silence, splice, stage } from "../../src/lang/staging.ts";
import { findPhrases } from "../../src/lang/harmony.ts";

beforeAll(async () => {
  await ready("en");
});

const ARRANGED = SONGS.filter((s) => !s.band);
const staged = (id: string, voices = 4) => {
  const song = SONGS.find((s) => s.id === id)!;
  return { song, a: arrange(timed(songTune(song).notes), { voices, style: "staged", lyrics: song.lyrics }) };
};

describe("the form", () => {
  test("Twinkle is heard as A B C C A B: its middle line sung twice, its opening come back", () => {
    const { a } = staged("twinkle");
    expect(a.staging!.phrases.map((p) => p.label).join(" ")).toBe("A B C C A B");
  });

  test("a phrase longer than four bars is parted after a long note near its middle", () => {
    const { a } = staged("plain-grace");
    // Amazing grace is heard as two long phrases; staged, as its four lines
    expect(a.staging!.phrases.length).toBe(4);
    const tune = timed(songTune(SONGS.find((s) => s.id === "plain-grace")!).notes);
    const parted = lines(tune, [{ first: 0, last: tune.length - 1, t: tune[0].t, end: tune[tune.length - 1].t + tune[tune.length - 1].d, close: tune[tune.length - 1].t }], 1e9);
    expect(parted.length).toBe(1);
  });
});

describe("the plan", () => {
  for (const song of ARRANGED) {
    test(`${song.id}: the tune always sung, the voices in one by one, everyone at the end`, () => {
      const { a } = staged(song.id);
      const plan = a.staging!;
      const tuneLine = a.voices.findIndex((v) => v.tune);
      const all = a.voices.map((_, i) => i);
      expect(plan.phrases[0].lines).toEqual([tuneLine]);
      // the tune is always sung: by its own line, or where the men take it, by the tenor
      const tenor = a.voices.findIndex((v) => v.part === "tenor");
      for (const p of plan.phrases) expect(p.lines).toContain(p.texture === "men" ? tenor : tuneLine);
      expect(plan.phrases[plan.phrases.length - 1].lines).toEqual(all);
      // everyone sings for at least the last third
      const fullFrom = plan.phrases.findIndex((p, i) => plan.phrases.slice(i).every((q) => q.lines.length === all.length || q.lines.length === 2));
      expect(fullFrom).toBeLessThanOrEqual(Math.ceil(plan.phrases.length * 0.67));
      // until everyone sings, nobody who has come in leaves
      for (let i = 1; i < plan.phrases.length && plan.phrases[i - 1].lines.length < all.length; i++)
        for (const l of plan.phrases[i - 1].lines) expect(plan.phrases[i].lines).toContain(l);
      // energy rises from the tune alone to everyone
      expect(energyAt(plan, plan.phrases[0].t)).toBe(0);
      expect(energyAt(plan, plan.phrases[plan.phrases.length - 1].t)).toBe(1);
      expect(plan.story.startsWith("Soprano alone")).toBe(true);
    });
  }

  test("a long song lightens once, on a new strain, and the choir comes back", () => {
    const { a } = staged("plain-adeste");
    const sizes = a.staging!.phrases.map((p) => p.lines.length);
    const peak = sizes.indexOf(4);
    const dip = sizes.findIndex((n, i) => i > peak && n < 4);
    expect(dip).toBeGreaterThan(peak);
    expect(sizes.slice(dip + 1).every((n) => n === 4)).toBe(true);
    expect(a.staging!.story).toMatch(/the (men take the tune|women answer) in the (fifth|sixth) phrase/);
  });

  test("two voices: the tune alone, then both; one voice: everyone throughout", () => {
    const tune = timed(songTune(SONGS[0]).notes);
    const phrases = findPhrases(tune);
    const two = stage(tune, phrases, ["Soprano", "Bass"]);
    expect(two.phrases[0].lines).toEqual([0]);
    expect(two.phrases[two.phrases.length - 1].lines).toEqual([0, 1]);
    expect(stage(tune, phrases, ["Soprano"]).phrases.every((p) => p.lines.length === 1)).toBe(true);
    expect(form(tune, []).length).toBe(0);
  });
});

describe("the words stay on their notes", () => {
  test("a resting line's score is silent in its rests, and sings every other word as the whole song does", () => {
    const { song, a } = staged("old100");
    for (const v of a.voices) {
      const whole = sing(v.notes, v.lyrics, { lang: "en", vibrato: 0, transpose: 0 });
      const cut = silence(whole, v.rests ?? []);
      // nothing is sung in a rest but the first sounds of a word it keeps (a consonant comes before its beat)
      const kept = (t: number) => (cut.words ?? []).some((w) => t >= w.t - 1e-6 && t <= w.t + w.d + 1e-6);
      for (const p of cut.phones) for (const [x, y] of v.rests ?? []) if (p.t + p.d / 2 >= x && p.t + p.d / 2 < y) expect(kept(p.t + p.d / 2)).toBe(true);
      // the words it keeps are the whole song's, at the same times
      for (const w of cut.words ?? []) expect(whole.words!.some((x) => x.t === w.t && x.text === w.text)).toBe(true);
      if (!v.rests) expect(cut).toBe(whole);
      else expect(cut.words!.length).toBeLessThan(whole.words!.length);
    }
    expect(song.id).toBe("old100");
  });
});

describe("the band grows with the singing", () => {
  test("the drums wait for the whole choir; the bass plays from the first phrase", () => {
    const { a } = staged("joy", 4);
    const tune = a.voices.find((v) => v.tune)!.notes;
    const plan = a.staging!;
    const full = plan.phrases.find((p) => p.lines.length === 4)!.t;
    const band = arrangeBand(tune, a.voices.map((v) => heard(v.notes, v.rests ?? [])), ["bass", "harp", "strings", "timpani"], { energy: (t) => energyAt(plan, t) }).band;
    const first = (id: string) => Math.min(...band.find((p) => p.instrument === id)!.notes.map((n) => n.t));
    expect(first("timpani")).toBeGreaterThanOrEqual(full - 0.6 * 4 - 1e-6);
    expect(first("bass")).toBeLessThan(plan.phrases[1].t);
    expect(first("strings")).toBeGreaterThan(first("harp") - 1e-6);
  });
});

describe("textures", () => {
  test("while the choir builds, those who have joined hum; once it is whole, nobody hums", () => {
    // the critic may prefer words for a quick song: take the first plan it offers that hums
    const song = SONGS.find((x) => x.id === "twinkle")!;
    let a = staged("twinkle").a;
    for (let v = 1; v < a.plans!.count && !a.staging!.phrases.some((p) => p.hum.length); v++) a = arrange(timed(songTune(song).notes), { voices: 4, style: "staged", lyrics: song.lyrics, variant: v });
    const plan = a.staging!;
    const tuneLine = a.voices.findIndex((v) => v.tune);
    const whole = plan.phrases.findIndex((p) => p.lines.length === a.voices.length);
    plan.phrases.forEach((p, i) => {
      if (i < whole) expect(p.hum).toEqual(p.lines.filter((l) => l !== tuneLine));
      else expect(p.hum).toEqual([]);
    });
    expect(a.voices.find((v) => v.part === "bass")?.hum ?? "a").toBe("a");
    expect(a.voices.find((v) => v.part === "alto")!.hum).toBe("u");
  });

  test("the men take the tune: the tenor sings it an octave down, the bass under him", () => {
    const { a } = staged("jacques");
    const p = a.staging!.phrases.find((x) => x.texture === "men")!;
    const tune = a.voices.find((v) => v.tune)!.notes.filter((n) => n.t >= p.t - 1e-6 && n.t < p.end - 1e-6);
    const tenor = a.voices.find((v) => v.part === "tenor")!.notes;
    const bass = a.voices.find((v) => v.part === "bass")!.notes;
    for (const n of tune) {
      const t = tenor.find((x) => Math.abs(x.t - n.t) < 1e-6)!;
      expect((n.midi - t.midi) % 12).toBe(0);
      expect(bass.find((x) => Math.abs(x.t - n.t) < 1e-6)!.midi).toBeLessThan(t.midi);
    }
    // and the women rest
    for (const v of a.voices.filter((x) => x.part === "soprano" || x.part === "alto")) expect(v.rests!.some(([x, y]) => x <= p.t && p.end <= y + 1e-6)).toBe(true);
  });

  test("the women answer: the alto a third or a sixth under the tune, in the key", () => {
    const { a } = staged("jacques");
    const p = a.staging!.phrases.find((x) => x.texture === "women")!;
    const tune = a.voices.find((v) => v.tune)!.notes.filter((n) => n.t >= p.t - 1e-6 && n.t < p.end - 1e-6);
    const alto = a.voices.find((v) => v.part === "alto")!.notes;
    const F = [0, 2, 4, 5, 7, 9, 11].map((x) => (x + 5) % 12);
    let duet = 0;
    for (const n of tune) {
      const m = alto.find((x) => Math.abs(x.t - n.t) < 1e-6)!.midi;
      if ([3, 4, 8, 9].includes(n.midi - m)) duet++;
      expect(F).toContain(((m % 12) + 12) % 12);
    }
    expect(duet / tune.length).toBeGreaterThan(0.8);
  });

  test("a slow song's tune leans into its cadences from the note above; a quick one does not", () => {
    const { a } = staged("old100");
    const leans = a.voices.find((v) => v.tune)!.leans!;
    expect(leans.length).toBeGreaterThan(0);
    for (const l of leans) expect(l.from - l.midi).toBeGreaterThanOrEqual(1);
    expect(staged("joy").a.voices.find((v) => v.tune)!.leans).toBeUndefined();
  });

  test("a phrase sung another way is put in its place; a lean is in the pitch", () => {
    const notes = [{ t: 1, d: 0.5, midi: 67 }, { t: 1.5, d: 1, midi: 69 }, { t: 3, d: 1, midi: 67 }];
    const base = sing(notes, "hel-lo there", { lang: "en", vibrato: 0, transpose: 0 });
    const hum = sing(notes, "u u u", { lang: "ipa", vibrato: 0, transpose: 0 });
    const both = splice(base, hum, [[0, 2.8]]);
    expect(both.phones.filter((p) => p.t + p.d / 2 < 2.8 && p.ph !== "_").every((p) => p.ph === "u")).toBe(true);
    expect(both.words!.map((w) => w.text)).toEqual(["there"]);
    const leaned = lean(base, [{ t: 3, d: 1, midi: 67, from: 69 }]);
    const at = (s: typeof base, t: number) => s.pitch.filter((p) => p.t <= t).pop()!.v;
    expect(at(leaned, 3.01)).toBeCloseTo(440, 0);
    expect(at(leaned, 3.5)).toBeCloseTo(392, 0);
  });
});

describe("the band, phrase by phrase", () => {
  test("the drums leave the lighter phrases and come back; the bass rests under the women; the harp answers the tune", async () => {
    const { a } = staged("jacques");
    const plan = a.staging!;
    const tune = a.voices.find((v) => v.tune)!.notes;
    const { energyAt: e, textureAt: x } = await import("../../src/lang/staging.ts");
    const band = arrangeBand(tune, a.voices.map((v) => heard(v.notes, v.rests ?? [])), ["bass", "harp", "kit"], { energy: (t) => e(plan, t), texture: (t) => x(plan, t) }).band;
    const notes = (id: string) => band.find((p) => p.instrument === id)!.notes;
    const men = plan.phrases.find((p) => p.texture === "men")!;
    const women = plan.phrases.find((p) => p.texture === "women")!;
    const inside = (n: { t: number }, p: { t: number; end: number }) => n.t >= p.t + 0.05 && n.t < p.end - 0.05;
    expect(notes("kit").filter((n) => inside(n, men) || inside(n, women)).length).toBe(0);
    expect(notes("kit").filter((n) => n.t > women.end).length).toBeGreaterThan(0);
    expect(notes("bass").filter((n) => inside(n, women)).length).toBe(0);
    expect(notes("bass").filter((n) => inside(n, men)).length).toBeGreaterThan(0);
    // the answers go over the tune, where it holds
    const over = notes("harp").filter((n) => n.midi > Math.max(...tune.filter((m) => m.t <= n.t && n.t < m.t + m.d + 2).map((m) => m.midi), 0));
    expect(over.length).toBeGreaterThan(0);
  });
});
