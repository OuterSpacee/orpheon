/**
 * The band. The strings and the hand drums are modal: every note a sum of exactly tuned partials,
 * each a decaying phasor, with nothing random and no filters, so they sound clean. The piano, the
 * flute and the kit stay physical models. All keep the rules the voice keeps (no allocation in
 * render, the same samples for any block size, any sample rate from 8 to 192 kHz without a NaN,
 * seeded noise where there is any).
 *
 *   modal.ts          the voices (partials as phasors), the pool, the steal, the string drawing
 *   modal-strings.ts  bass, harp, guitar, sarod, tanpura (plucked); strings, esraj (bowed)
 *   modal-drums.ts    timpani and tabla
 *   piano.ts          felt hammers into two or three detuned strings
 *   flute.ts          an air jet across a pipe
 *   membrane.ts       the kit: struck membranes and plates as their modes, with noise
 *   core.ts           the schedule, the render loop, small filters      ranges.ts  what each plays
 *
 * BandNote.midi for the drums: the kit takes General MIDI percussion numbers (35 to 59); the
 * timpani a pitch; the tabla its strokes: 0 ge (the bayan, open), 1 na (the dayan's rim),
 * 2 tin (the dayan, open and ringing), 3 ka (the bayan slapped flat), 4 ti (the dayan, closed).
 * A bol played on both drums (dha, dhin) is two notes at once.
 *
 * What sense() writes (INSTRUMENT_TELEMETRY_SIZE floats):
 *
 *   0       loudness, 0..1 (1 is a note played firmly)
 *   1       family: 1 plucked string, 2 bowed string, 3 piano, 4 pipe, 5 drum
 *   2       the last note begun (its BandNote.midi), 0 before any
 *   3       seconds since it began, -1 before any
 *   4       how many voices are sounding
 *
 *   strings (bass, harp, guitar, tanpura, sarod, strings, esraj, piano):
 *   8..39   the loudest string's displacement at 32 points from the bridge to the far end,
 *           -1..1 (normalised to its largest)
 *   40..63  up to 12 sounding notes as pairs (midi, loudness 0..1), loudest first
 *
 *   flute:
 *   8..39   the sound pressure along the pipe at 32 points, mouth hole to foot, -1..1
 *   40      breath, 0..1
 *   41      the jet's swing across the edge, -1..1
 *
 *   drums (timpani, kit, tabla):
 *   8..23   the amplitude of each mode of the drum struck last, 0..1, in the order of 33..48
 *   24..31  how loud each drum is, 0..1: the kit's kick, snare, hi-hat, low, mid and high tom,
 *           crash, ride; the tabla's bayan, dayan; the timpani's first and second drum
 *   32      which drum was struck last (an index into 24..31)
 *   33..48  that drum's mode frequencies as ratios to its lowest, so a drawing can lay out its
 *           rings (0 past its last mode)
 */
import type { Instrument, InstrumentId } from "../contract.ts";
import { Flute } from "./flute.ts";
import { Kit } from "./membrane.ts";
import { Timpani, Tabla } from "./modal-drums.ts";
import { Bass, Esraj, Guitar, Harp, Sarod, Strings, Tanpura } from "./modal-strings.ts";
import { Piano } from "./piano.ts";

export { PLAYABLE } from "./ranges.ts";

/** Make one instrument of the band. */
export function createInstrument(id: InstrumentId, sampleRate: number): Instrument {
  switch (id) {
    case "bass":
      return new Bass(sampleRate);
    case "harp":
      return new Harp(sampleRate);
    case "guitar":
      return new Guitar(sampleRate);
    case "tanpura":
      return new Tanpura(sampleRate);
    case "sarod":
      return new Sarod(sampleRate);
    case "strings":
      return new Strings(sampleRate);
    case "esraj":
      return new Esraj(sampleRate);
    case "piano":
      return new Piano(sampleRate);
    case "flute":
      return new Flute(sampleRate);
    case "timpani":
      return new Timpani(sampleRate);
    case "kit":
      return new Kit(sampleRate);
    case "tabla":
      return new Tabla(sampleRate);
  }
}
