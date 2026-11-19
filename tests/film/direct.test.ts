// A song's shot list, as Video makes it from the performance: for "Amazing grace" and the "Ode an
// die Freude", sung by their choirs with their bands, every shot starts on one of the song's own
// caption lines or on a voice coming in (or the ending), none is shorter than MIN_SHOT, each voice
// that comes in after a rest is in the shot that starts there, and the list is the same every time.
import { describe, expect, test } from "bun:test";
import { musicOf, planFor } from "../../src/app/film/direct.ts";
import { MIN_SHOT, planShots, shotAt } from "../../src/view/director.ts";
import { performed } from "./direct-fixture.ts";

for (const song of ["grace", "freude"]) {
  describe(song, async () => {
    const { p, singers } = await performed(song);
    const music = musicOf(p, singers);

    test("the music: four heads, each singing, the song's own lines", () => {
      expect(singers.length).toBe(4);
      expect(music.voices.every((v) => v.length > 0)).toBe(true);
      expect(music.lines.length).toBe(p.captions!.length);
      expect(music.length).toBeGreaterThan(60);
    });

    test("cuts land on the song's lines and entries, every shot held MIN_SHOT or more", () => {
      const plan = planFor(p, singers, 6, 0.7);
      const lineStarts = p.captions!.map((c) => c.t0);
      const entries = music.voices.flatMap((v) => v.filter(([a], k) => k === 0 || a - v[k - 1][1] >= 2.5).map(([a]) => a));
      plan.shots.forEach((s, k) => {
        expect(s.t1 - s.t0).toBeGreaterThanOrEqual(MIN_SHOT - 1e-9);
        if (k === 0 || s.why === "final") return;
        const near = Math.min(...[...lineStarts, ...entries].map((t) => Math.abs(t - 0.15 - s.t0)));
        expect(near).toBeLessThan(0.01);
      });
      expect(plan.shots[0].kind).toBe("wide");
      expect(plan.shots[plan.shots.length - 1].kind).toBe("crane");
    });

    test("a voice that comes in after a rest is in the shot its entry starts", () => {
      const plan = planFor(p, singers, 6, 0.7);
      music.voices.forEach((spans, head) => {
        spans.forEach(([a], k) => {
          if (!(k === 0 || a - spans[k - 1][1] >= 2.5)) return;
          const s = plan.shots[shotAt(plan, a + 0.2)];
          // (a choir coming in all together is shown whole)
          if (s.t0 > a - 1 && s.kind !== "crane") expect(s.who.length === 0 || s.who.includes(head)).toBe(true);
        });
      });
    });

    test("the same performance and seed give the same shots; another seed others", () => {
      expect(planShots(musicOf(p, singers), 6, 0.7)).toEqual(planShots(musicOf(p, singers), 6, 0.7));
      expect(planFor(p, singers, 6, 0.7)).toBe(planFor(p, singers, 6, 0.7));
      const a = planShots(music, 6, 0.7).shots.map((s) => `${s.kind}${s.who}`).join();
      const b = planShots(music, 9, 0.7).shots.map((s) => `${s.kind}${s.who}`).join();
      expect(a).not.toBe(b);
    });
  });
}
