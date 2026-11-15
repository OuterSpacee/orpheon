// The AI arranger's answers are checked before anything uses them: what is not Orpheon's is
// dropped, choices are held to the ones offered, and words come only for a known song in the
// public domain, in a language Orpheon sings. Its preferences steer the critic, never overrule it.
import "../fixtures/plain-songs.ts";
import { describe, expect, test } from "bun:test";
import { SINGABLE, SYSTEM, briefText, checkAdvice, jsonIn } from "../../src/ai/arranger.ts";
import { SONGS, songTune, timed } from "../../src/app/songs.ts";
import { arrange } from "../../src/lang/arrange.ts";
import { agreement } from "../../src/lang/critic.ts";
import { briefOf } from "../../src/app/sing/advice.ts";

const good = {
  song: { title: "Greensleeves", known: true, origin: "traditional English", language: "en", publicDomain: true },
  mood: "wistful",
  band: ["harp", "flute", "strings"],
  plan: { fullAt: 0.55, breather: "women-men", hum: true, first: "alto" },
  words: { text: "A-las my love you do me wrong\nto cast me off dis-cour-teous-ly", language: "en" },
  why: "A gentle old song.",
};

describe("checking an answer", () => {
  test("a good answer passes whole, from bare JSON, a fenced block or after a sentence", () => {
    for (const reply of [good, JSON.stringify(good), "```json\n" + JSON.stringify(good) + "\n```", "Here it is: " + JSON.stringify(good) + " Enjoy."]) {
      const a = checkAdvice(reply)!;
      expect(a.band).toEqual(["harp", "flute", "strings"]);
      expect(a.plan).toEqual({ fullAt: 0.55, breather: "women-men", hum: true, first: "alto" });
      expect(a.words?.language).toBe("en");
      expect(a.song.title).toBe("Greensleeves");
    }
  });

  test("what is not Orpheon's is dropped, choices fall back to the arranger's own", () => {
    const a = checkAdvice({ ...good, band: ["harp", "banjo", "harp", "kazoo", "tabla"], plan: { fullAt: 0.9, breather: "solo", hum: "yes", first: "soprano" } })!;
    expect(a.band).toEqual(["harp", "tabla"]);
    expect(a.plan).toEqual({ fullAt: 0.45, breather: "men-women", hum: false, first: "alto" });
  });

  test("no words for a song that may be under copyright, an unknown one, or in a language Orpheon cannot sing", () => {
    expect(checkAdvice({ ...good, song: { ...good.song, publicDomain: false } })!.words).toBeNull();
    expect(checkAdvice({ ...good, song: { ...good.song, known: false } })!.words).toBeNull();
    expect(checkAdvice({ ...good, words: { text: "one two", language: "en" } })!.words).toBeNull();
    expect(checkAdvice({ ...good, words: { ...good.words, language: "de" } })!.words!.language).toBe("en");
    expect(SINGABLE).not.toContain("de" as never);
  });

  test("nothing usable is null: no band, no JSON, nonsense", () => {
    expect(checkAdvice({ ...good, band: ["banjo"] })).toBeNull();
    expect(checkAdvice("I cannot help with that.")).toBeNull();
    expect(checkAdvice(null)).toBeNull();
    expect(jsonIn("{ broken")).toBeNull();
  });

  test("the model is told the instruments, the rules for words, and the answer's shape", () => {
    for (const id of ["tanpura", "sarod", "esraj", "kit", "harp"]) expect(SYSTEM).toContain(`- ${id}:`);
    expect(SYSTEM).toContain("public domain");
    expect(SYSTEM).toContain("never invent words");
  });
});

describe("the brief", () => {
  test("says what the file says of itself and what the page heard, briefly", () => {
    const song = SONGS.find((s) => s.id === "plain-grace")!;
    const tune = songTune(song);
    const b = briefOf({ ...tune, notes: timed(tune.notes) }, "amazing-grace.mid");
    expect(b.file).toBe("amazing-grace.mid");
    expect(b.meter).toContain("3");
    expect(b.tune.split(" ").length).toBeLessThanOrEqual(48);
    expect(b.form.split(" ").length).toBe(4);
    const text = briefText(b);
    expect(text.length).toBeLessThan(2500);
    expect(text).toContain("Tune begins:");
  });
});

describe("a preference steers the critic", () => {
  test("asked for the bass first and a late build, the plan sung agrees, and stays clean", () => {
    const song = SONGS.find((s) => s.id === "plain-adeste")!;
    const notes = timed(songTune(song).notes);
    const plain = arrange(notes, { voices: 4, style: "staged", lyrics: song.lyrics });
    const asked = arrange(notes, { voices: 4, style: "staged", lyrics: song.lyrics, prefer: { first: "bass", fullAt: 0.55 } });
    expect(asked.staging!.story).toContain("Bass");
    expect(asked.staging!.story.indexOf("Bass")).toBeLessThan(asked.staging!.story.indexOf("Tenor") < 0 ? 1e9 : asked.staging!.story.indexOf("Tenor"));
    expect(asked.staging!.story).not.toBe(plain.staging!.story);
    expect(agreement({ fullAt: 0.55, order: [3, 1, 2] }, { first: "bass", fullAt: 0.55 }, ["Soprano", "Alto", "Tenor", "Bass"])).toBe(2);
  });
});

describe("words from the model's memory", () => {
  test("are used only when they fit the tune: a syllable to a note, give or take", async () => {
    const { wordsFit } = await import("../../src/app/sing/advice.ts");
    const row = "Row, row, row your boat\nGent-ly down the stream\nMer-ri-ly, mer-ri-ly, mer-ri-ly, mer-ri-ly\nLife is but a dream";
    expect(wordsFit(row, 27)).toBe(true);
    // what it gave for Adeste fideles: a short verse it made up, against seventy-odd notes
    expect(wordsFit("Ad-es-te fi-de-les,\nChri-sti-an-i,\nLaud-e-mus,\nChri-stum,\nVe-ni-mus,\nAd-o-ra-mus.", 72)).toBe(false);
    expect(wordsFit(row, 0)).toBe(false);
    expect(wordsFit(row + " " + row, 27)).toBe(false);
  });
});
