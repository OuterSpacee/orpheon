// The two hymns as plain tunes, as they were before the page gave them arrangements of their own
// (src/app/written/grace.ts, adeste.ts): the arranger's own tests stage and judge these, so the
// tests keep a long arranged hymn in three and one in four. Added to the song list for the tests.
import { SONGS, type Song } from "../../src/app/songs.ts";

export const PLAIN: Song[] = [
  {
    id: "plain-grace",
    title: "Amazing grace (the tune alone)",
    credit: "American tune “New Britain”, 1829; words by John Newton, 1779",
    lang: "en",
    meter: 3,
    bpm: 80,
    tune: `D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 |
           G4:2 B4:.5 G4:.5 | B4:2 A4 | D5:3~ | D5:2 B4 |
           D5:1.5 B4:.5 D5:.5 B4:.5 | G4:2 D4 | E4:1.5 G4:.5 G4:.5 E4:.5 | D4:2 D4 |
           G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:3~ | G4:2`,
    lyrics: `A-ma-zing _ grace how sweet the sound
             that saved a _ wretch like me
             I once _ was _ lost but now _ am _ found
             was blind but _ now I see`,
  },  {
    id: "plain-adeste",
    title: "Adeste fideles (the tune alone)",
    credit: "John Francis Wade, about 1743; the Latin hymn",
    lang: "la",
    meter: 4,
    bpm: 104,
    tune: `G4 | G4:2 D4 G4 | A4:2 D4:2 | B4 A4 B4 C5 | B4:2 A4 G4 |
           G4:2 F#4 E4 | F#4 G4 A4 B4 | F#4:2 E4:1.5 D4:.5 | D4:3 r |
           D5:2 C5 B4 | C5:2 B4:2 | A4 B4 G4 A4 | F#4:1.5 E4:.5 D4 G4 |
           G4 F#4 G4 A4 | G4:2 D4 B4 | B4 A4 B4 C5 | B4:2 A4 B4 |
           C5 B4 A4 G4 | F#4:2 G4 C5 | B4:2 A4:1.5 G4:.5 | G4:3`,
    lyrics: `A-des-te fi-de-les lae-ti tri-um-phan-tes
             ve-ni-te ve-ni _ te in Beth _ le-hem
             Na-tum vi-de-te re-gem an-ge-lo _ rum
             ve-ni-te a-do-re-mus
             ve-ni-te a-do-re-mus
             ve-ni-te a-do-re-mus Do _ mi _ num`,
  },];

/** Put the plain tunes in the song list (once), so lineup() and songById() find them. */
export function withPlainSongs(): void {
  for (const song of PLAIN) if (!SONGS.some((s) => s.id === song.id)) SONGS.push(song);
}
withPlainSongs();
