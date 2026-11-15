/**
 * From an imported song to the one line the voice sings: which track is the tune
 * (`rankMelodyTracks`), that track as a single voice (`extractMelody`), and the line moved into
 * a singer's range (`fitRange`). Plain data in, plain data out: nothing here calls the engine.
 *
 * Choosing the track. Drums and tracks with no notes are never offered. A track that carries
 * the file's lyrics, or is named like a vocal part, wins outright: each is worth more than
 * everything the note-shape guesses below can add up to. A karaoke file keeps its words in a
 * track of their own with no notes, so there the words are matched against every track's note
 * starts and the track they land on gets the credit. Failing all that, the guess is a track
 * that plays one note at a time, in a singing range, mostly by step, and not too few or too
 * fast: a bass line is too low, chords overlap, an arpeggio leaps and hurries.
 *
 * Making one voice. At each onset the highest note is kept (notes that start within 30 ms of
 * each other count as one onset: a hand never lands a chord on a single tick). A note is cut
 * short when the next kept note starts, whatever its pitch: a tune that steps down while the
 * old key is still held has moved on. So a long high note held over a moving accompaniment in
 * the same track is cut by the accompaniment; that is the price of the rule. Notes left
 * shorter than 30 ms are dropped, and a gap shorter than 40 ms is closed by holding the earlier
 * note, so legato playing does not become a string of tiny rests.
 *
 * Both clocks stay true: a note is only ever cut or stretched to the start of the next note,
 * whose beat and second the importer already worked out through the tempo map.
 *
 * Fitting a range. Whole octaves first, since they keep the key; among the octaves that fit,
 * the most centred one, so a tune that already fits may still move an octave when that sits
 * better. Semitones only when no octave fits. A tune wider than the range cannot fit: it is
 * centred, by semitones, and returned anyway.
 */
import type { ImportedSong, ImportedTrack, Melody, MelodyNote } from "./song-types.ts";

/** shorter than this is not a sung note; closer than this is one onset */
const MIN_NOTE = 0.03;
/** a rest shorter than this is the player's legato, not a rest */
const MAX_GAP = 0.04;
/** how far a lyric event may sit from the note it belongs to */
const LYRIC_SLACK = 0.05;
/** the range a person might sing, generously: C3 to C6 */
const SING_LOW = 48;
const SING_HIGH = 84;

const VOCAL_NAME = /\b(vocal|voice|vox|melod|lead|sing|lyric)/i;

/**
 * How well a set of lyric events sits on a set of notes, 0..1: the share of the lyrics that
 * have a note starting with them, marked down when most of the notes have no lyric (an
 * arpeggio catches every syllable by playing all the time).
 */
export function lyricFit(notes: readonly { time: number }[], lyrics: readonly { time: number }[]): number {
  if (!notes.length || !lyrics.length) return 0;
  const onsets = [...new Set(notes.map((n) => n.time))].sort((a, b) => a - b);
  const hit = new Set<number>();
  let matched = 0;
  for (const l of lyrics) {
    // the first onset at or after the lyric, then whichever neighbour is nearer
    let lo = 0;
    let hi = onsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (onsets[mid] < l.time) lo = mid + 1;
      else hi = mid;
    }
    const i = lo > 0 && (lo === onsets.length || l.time - onsets[lo - 1] <= onsets[lo] - l.time) ? lo - 1 : lo;
    if (Math.abs(onsets[i] - l.time) <= LYRIC_SLACK) {
      matched++;
      hit.add(i);
    }
  }
  return (matched / lyrics.length) * (0.5 + (0.5 * hit.size) / onsets.length);
}

/** the share of the track's sounding time in which two or more notes sound at once, 0..1 */
function overlapShare(track: ImportedTrack): number {
  const edges: [number, number][] = [];
  for (const n of track.notes) edges.push([n.time, 1], [n.time + n.duration, -1]);
  // ends before starts at the same instant: back-to-back notes do not overlap
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let sounding = 0;
  let together = 0;
  let count = 0;
  let last = 0;
  for (const [t, d] of edges) {
    if (count >= 1) sounding += t - last;
    if (count >= 2) together += t - last;
    count += d;
    last = t;
  }
  return sounding > 0 ? together / sounding : 0;
}

/**
 * The tracks a voice could sing, best guess first. `track` is the track's `index`; `why` is the
 * two things that weighed most, in plain words.
 */
export function rankMelodyTracks(song: ImportedSong): { track: number; score: number; why: string }[] {
  // karaoke words: lyrics in a track with no notes belong to some other track's notes
  const loose = song.tracks.filter((t) => t.notes.length === 0).flatMap((t) => t.lyrics);
  const ranked: { track: number; score: number; why: string }[] = [];
  for (const t of song.tracks) {
    if (t.drums || t.notes.length === 0) continue;
    const reasons: [number, string][] = [];

    if (t.lyrics.length) {
      const fit = lyricFit(t.notes, t.lyrics);
      reasons.push([100 + 50 * fit, fit >= 0.5 ? "has the lyrics on its notes" : "has the file's lyrics"]);
    } else if (loose.length) {
      const fit = lyricFit(t.notes, loose);
      if (fit > 0) reasons.push([100 * fit, fit >= 0.5 ? "its notes line up with the karaoke words" : "a few notes line up with the karaoke words"]);
    }
    if (VOCAL_NAME.test(t.name)) reasons.push([100, `named "${t.name}"`]);

    const overlap = overlapShare(t);
    reasons.push([25 * (1 - 2 * overlap), overlap < 0.15 ? "one note at a time" : overlap > 0.5 ? "mostly chords" : "some chords"]);

    const pitches = t.notes.map((n) => n.midi).sort((a, b) => a - b);
    const median = pitches[pitches.length >> 1];
    if (median < SING_LOW) reasons.push([-25, "low, like a bass line"]);
    else if (median > SING_HIGH) reasons.push([-10, "very high"]);
    else {
      const inside = pitches.filter((p) => p >= SING_LOW && p <= SING_HIGH).length / pitches.length;
      reasons.push([15 * inside, inside >= 0.8 ? "in a singing range" : "partly outside a singing range"]);
    }

    const line = extractMelody(t).notes;
    let steps = 0;
    for (let i = 1; i < line.length; i++) if (Math.abs(line[i].midi - line[i - 1].midi) <= 2) steps++;
    const stepShare = line.length > 1 ? steps / (line.length - 1) : 0;
    reasons.push([15 * stepShare, stepShare >= 0.5 ? "moves mostly by step" : "leaps a lot"]);

    if (line.length < 8) reasons.push([-20 * (1 - line.length / 8), line.length === 1 ? "only 1 note" : `only ${line.length} notes`]);
    else {
      const span = line[line.length - 1].time + line[line.length - 1].duration - line[0].time;
      if (line.length / span > 6) reasons.push([-15, "very fast notes"]);
    }

    const score = reasons.reduce((s, r) => s + r[0], 0);
    reasons.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
    ranked.push({ track: t.index, score, why: reasons.slice(0, 2).map((r) => r[1]).join(", ") });
  }
  return ranked.sort((a, b) => b.score - a.score || a.track - b.track);
}

/**
 * One voice from a track that may play several notes at once (see the header for the rules).
 * `lowest` keeps the lowest note of each onset instead: the line a bass would sing.
 */
export function extractMelody(track: ImportedTrack, lowest = false): Melody {
  const src = [...track.notes].sort((a, b) => a.time - b.time || a.midi - b.midi);

  // the highest note of each onset
  const top: MelodyNote[] = [];
  for (let i = 0; i < src.length; ) {
    let best = src[i];
    let j = i + 1;
    for (; j < src.length && src[j].time - src[i].time < MIN_NOTE; j++) if (lowest ? src[j].midi < best.midi : src[j].midi > best.midi) best = src[j];
    top.push({ midi: best.midi, beat: best.beat, beats: best.beats, time: best.time, duration: best.duration, velocity: best.velocity });
    i = j;
  }

  // each note ends when the next begins
  const holdUntil = (n: MelodyNote, next: MelodyNote) => {
    n.beats = next.beat - n.beat;
    n.duration = next.time - n.time;
  };
  for (let i = 0; i + 1 < top.length; i++) if (top[i].time + top[i].duration > top[i + 1].time) holdUntil(top[i], top[i + 1]);

  const notes = top.filter((n) => n.duration >= MIN_NOTE);
  for (let i = 0; i + 1 < notes.length; i++) {
    const gap = notes[i + 1].time - (notes[i].time + notes[i].duration);
    if (gap > 0 && gap < MAX_GAP) holdUntil(notes[i], notes[i + 1]);
  }
  return { track: track.index, notes };
}

/**
 * The melody moved to sit inside [low, high] (MIDI notes), as centred as it can be. `shift` is
 * the semitones added to every note.
 */
export function fitRange(melody: Melody, low: number, high: number): { melody: Melody; shift: number } {
  if (!melody.notes.length) return { melody: { track: melody.track, notes: [] }, shift: 0 };
  let bottom = Infinity;
  let top = -Infinity;
  for (const n of melody.notes) {
    bottom = Math.min(bottom, n.midi);
    top = Math.max(top, n.midi);
  }
  /** the shift that would put the line's middle on the range's middle (may be a half) */
  const ideal = (low + high - bottom - top) / 2;
  const best = (shifts: number[]): number | null => {
    let pick: number | null = null;
    for (const s of shifts) {
      if (pick === null) pick = s;
      else {
        const d = Math.abs(s - ideal) - Math.abs(pick - ideal);
        // equally centred: the smaller move
        if (d < 0 || (d === 0 && Math.abs(s) < Math.abs(pick))) pick = s;
      }
    }
    return pick;
  };
  const between = (from: number, to: number, step: number): number[] => {
    const out: number[] = [];
    // "+ 0": a shift of minus zero is zero
    for (let k = Math.ceil(from / step); k * step <= to; k++) out.push(k * step + 0);
    return out;
  };
  // the shifts that fit run from (low - bottom) to (high - top): none when the line is too wide
  const shift = best(between(low - bottom, high - top, 12)) ?? best(between(low - bottom, high - top, 1)) ?? best([Math.floor(ideal), Math.ceil(ideal)]) ?? 0;
  return { melody: { track: melody.track, notes: melody.notes.map((n) => ({ ...n, midi: n.midi + shift })) }, shift };
}
