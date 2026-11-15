// Hear the band (nobody here can, so this is for the owner): every instrument alone, and a
// built-in song arranged for choir and band, as WAV files in out/band/.
//
//   bun tools/band-render.ts                    each instrument, then "Amazing grace" for four voices and its suggested band
//   bun tools/band-render.ts --song joy --style oohs --voices 5 --band strings,bass,timpani,flute
//   bun tools/band-render.ts --only instruments | --only song
//
// The instrument files play a scale or a pattern; the song is mixed in stereo, each part at its
// level and place, voices included (it takes a minute: the voices are simulated bodies).
import { BODIES, INSTRUMENTS, type BandNote, type InstrumentId } from "../src/contract.ts";
import { createInstrument, PLAYABLE } from "../src/band/index.ts";
import { SONGS, songTune, timed } from "../src/app/songs.ts";
import { arrange } from "../src/lang/arrange.ts";
import { ready, sing } from "../src/lang/index.ts";
import { createVoice } from "../src/voice/index.ts";
import { mkdirSync } from "node:fs";

const flag = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const RATE = 48000;
const only = flag("only", "");
mkdirSync("out/band", { recursive: true });

/** A 16-bit WAV, one channel or two. */
function wav(channels: Float32Array[], rate: number): Uint8Array {
  const n = channels[0].length;
  const c = channels.length;
  const bytes = new Uint8Array(44 + 2 * n * c);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + 2 * n * c, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, c, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2 * c, true);
  view.setUint16(32, 2 * c, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 2 * n * c, true);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) view.setInt16(44 + 2 * (i * c + k), Math.round(Math.max(-1, Math.min(1, channels[k][i])) * 32767), true);
  return bytes;
}

function play(id: InstrumentId, notes: BandNote[], seconds: number): Float32Array {
  const ins = createInstrument(id, RATE);
  ins.perform(notes, 0);
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 128) ins.render(out.subarray(i, Math.min(out.length, i + 128)));
  return out;
}

/** What each instrument plays alone: a scale up its range, a chord, or its drums one by one. */
function demo(id: InstrumentId): BandNote[] {
  const notes: BandNote[] = [];
  if (id === "kit") {
    [36, 38, 42, 46, 41, 45, 48, 49, 51, 53, 37].forEach((midi, i) => notes.push({ t: 0.2 + i * 0.7, d: 0.2, midi, velocity: 0.8 }));
    for (let i = 0; i < 16; i++) {
      const t = 8.5 + i * 0.25;
      notes.push({ t, d: 0.1, midi: 42, velocity: 0.6 });
      if (i % 4 === 0) notes.push({ t, d: 0.1, midi: 36, velocity: 0.9 });
      if (i % 4 === 2) notes.push({ t, d: 0.1, midi: 38, velocity: 0.8 });
    }
    return notes;
  }
  if (id === "tabla") {
    [0, 1, 2, 3, 4].forEach((midi, i) => notes.push({ t: 0.2 + i * 0.8, d: 0.3, midi, velocity: 0.8 }));
    // keherwa twice: dha ge na ti | na ka dhi na
    const bols = [[0, 1], [0], [1], [4], [1], [3], [0, 2], [1]];
    for (let k = 0; k < 16; k++) for (const midi of bols[k % 8]) notes.push({ t: 4.6 + k * 0.3, d: 0.3, midi, velocity: k % 8 === 0 ? 0.9 : 0.65 });
    return notes;
  }
  if (id === "tanpura") {
    for (let k = 0; k < 3; k++) [43, 48, 48, 36].forEach((midi, i) => notes.push({ t: 0.2 + k * 3.2 + i * 0.8, d: 3.2, midi, velocity: 0.7 }));
    return notes;
  }
  if (id === "timpani") {
    [38, 43, 45, 50, 55].forEach((midi, i) => notes.push({ t: 0.2 + i * 1.2, d: 0.5, midi, velocity: 0.8 }));
    for (let k = 0; k < 28; k++) notes.push({ t: 6.4 + k / 14, d: 0.07, midi: 43, velocity: 0.3 + (0.5 * k) / 28 });
    notes.push({ t: 8.4, d: 0.5, midi: 43, velocity: 0.9 });
    return notes;
  }
  const [lo, hi] = PLAYABLE[id];
  const from = Math.max(lo, 36);
  const to = Math.min(hi, 88);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  let t = 0.2;
  const step = id === "strings" || id === "flute" ? 0.45 : 0.3;
  for (let m = from; m <= to; m++) {
    if (!scale.includes(m % 12)) continue;
    notes.push({ t, d: step * 0.95, midi: m, velocity: 0.75 });
    t += step;
  }
  // then a chord (or, for the flute, a held note), left to ring
  const root = Math.max(from, Math.min(to - 7, 55));
  if (id === "flute") notes.push({ t: t + 0.3, d: 2.5, midi: 79, velocity: 0.7 });
  else for (const k of [0, 4, 7, 12]) notes.push({ t: t + 0.3 + (id === "harp" || id === "guitar" ? 0.04 * k : 0), d: 2.5, midi: root + k, velocity: 0.7 });
  return notes;
}

if (only !== "song") {
  for (const { id } of INSTRUMENTS) {
    const notes = demo(id);
    const seconds = Math.max(...notes.map((n) => n.t + n.d)) + 2;
    const path = `out/band/${id}.wav`;
    await Bun.write(path, wav([play(id, notes, seconds)], RATE));
    console.log(`${path}  ${seconds.toFixed(1)} s`);
  }
}

if (only !== "instruments") {
  await ready("en");
  const song = SONGS.find((s) => s.id === flag("song", "grace")) ?? SONGS[0];
  const tune = songTune(song);
  const style = flag("style", "hymn") as "hymn" | "oohs" | "round";
  const asked = flag("band", "");
  const band = asked ? (asked.split(",") as InstrumentId[]) : undefined;
  const a = arrange(timed(tune.notes), { voices: Number(flag("voices", "4")), style, band, lyrics: tune.lyrics });
  const end = Math.max(...a.voices.flatMap((v) => v.notes.map((n) => n.t + n.d)), ...a.band.flatMap((p) => p.notes.map((n) => n.t + n.d))) + 2;
  const left = new Float32Array(Math.round(end * RATE));
  const right = new Float32Array(left.length);
  const add = (x: Float32Array, level: number, place: number) => {
    // equal-power panning
    const angle = ((place + 1) * Math.PI) / 4;
    for (let i = 0; i < x.length && i < left.length; i++) {
      left[i] += x[i] * level * Math.cos(angle);
      right[i] += x[i] * level * Math.sin(angle);
    }
  };
  console.log(`${song.title}: ${a.analysis.keyName}, ${Math.round(a.analysis.tempo)} bpm in ${a.analysis.meter}, ${a.style}${a.round ? ` (${a.round.why})` : ""}`);
  console.log(`  chords: ${a.analysis.chords.map((c) => c.name).join(" ")}`);
  a.voices.forEach((v, i) => {
    const score = sing(v.notes, v.lyrics, { lang: tune.lang });
    const voice = createVoice(RATE, BODIES[v.body]);
    voice.perform(score, 0);
    const x = new Float32Array(left.length);
    for (let k = 0; k < x.length; k += 128) voice.render(x.subarray(k, Math.min(x.length, k + 128)));
    const place = a.voices.length < 2 ? 0 : -0.5 + i / (a.voices.length - 1);
    add(x, v.tune ? 0.6 : 0.45, place);
    console.log(`  ${v.name} (${v.body}): ${v.notes.length} notes`);
  });
  for (const part of a.band) {
    add(play(part.instrument, part.notes, end), part.level, part.place);
    console.log(`  ${part.name}: ${part.notes.length} notes`);
  }
  // keep the mix under full scale
  let peak = 0;
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < left.length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  const path = `out/band/${song.id}-${a.style}.wav`;
  await Bun.write(path, wav([left, right], RATE));
  console.log(`${path}  ${end.toFixed(1)} s, peak ${peak.toFixed(2)}${scale < 1 ? ` (scaled by ${scale.toFixed(2)})` : ""}`);
}
