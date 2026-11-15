// The flute: a jet of breath blown across the mouth hole of a pipe open at both ends.
//
// The jet leaves the lips, travels across the hole (a delay: the jet's travel time), and is
// deflected by the sound in the pipe, so that it blows more into the pipe or more out of it;
// the edge splits it, and the share that goes in is a smooth, saturating function of how far the
// jet is deflected. The pipe's resonances hold the sound; the jet's delay decides which of them
// the jet can feed, so blowing harder (a faster jet, a shorter delay) jumps to the octave. This
// is the jet-drive model as Fletcher & Rossing describe it ("The Physics of Musical
// Instruments", 2nd ed. 1998, ch. 16, after Coltman and Fletcher), reduced, as Cook did
// ("A meta-wind-instrument physical model", ICMC 1992), to two delay lines: the pipe's round
// trip with its lossy open ends, and the jet, with a cubic for the edge.
//
// The jet pulls the pitch a few cents off the pipe's own resonance, by an amount that changes
// with the note and the breath; a flautist hears it and rolls the flute or moves the lips to
// bring it back. So does this one: it times the pipe's swings and trims the pipe's length until
// their period is the note's, and remembers each note's trim for the next time.
import { CONTROL, DcBlock, hz, lowpassDelay, Noise, Player } from "./core.ts";

/** Pole of the open ends' loss (the highs radiate away first), and the share a round trip keeps. */
const END_DULL = 0.25;
const END_KEEP = 0.98;
/** Once the breath stops the player's lips close over the hole, and the pipe goes quiet within a few tenths of a second. */
const END_KEEP_AFTER = 0.85;
/**
 * The jet's travel time as a share of the period. A flautist shortens the jet in the top register
 * (lips nearer the edge, faster air), keeping the first resonance the one it feeds: 0.6 up to C6,
 * 0.5 from F#6 (with these, every note from C4 to C7 speaks in its first mode at any breath).
 */
const JET_LOW = 0.6;
const JET_HIGH = 0.5;
/** How much of the pipe's sound deflects the jet, and how much of the jet the edge sends in. */
const DEFLECT = 0.5;
const DRIVE = 0.3;
/** Breath noise, and the vibrato a flautist adds to a held note. */
const BREATH_NOISE = 0.035;
const VIBRATO_RATE = 5;
const VIBRATO_DEPTH = 0.035;

export class Flute extends Player {
  protected readonly family = 4;
  private bore: Float32Array;
  private jet: Float32Array;
  private size: number;
  private w = 0;
  private noise = new Noise(23);
  private dc: DcBlock;
  private rate: number;
  /** the pipe's delay now and where a new note's is heading (a slur glides there) */
  private delay = 100;
  private delayTarget = 100;
  private y1 = 0;
  private breath = 0;
  private breathTarget = 0;
  private midi = -1;
  private held = 0;
  private phase = 0;
  private energy = 0;
  private energyK: number;
  private lastJet = 0;
  private playing = false;
  private jetShare = JET_LOW;
  private keep = END_KEEP;
  /** how loud the note was asked to be */
  private level = 0;
  // the ear: the pipe's swings, timed at their upward zero crossings
  private trim = 0;
  private trims = new Float64Array(128);
  private heard = 0;
  private heard2 = 0;
  private heardBefore = 0;
  private steady = 0;
  private lastCross = -1;
  private error = 0;
  private crossings = 0;

  constructor(sampleRate: number) {
    super(sampleRate, 0.12);
    this.rate = sampleRate;
    this.size = Math.ceil(sampleRate / hz(58)) + 8;
    this.bore = new Float32Array(this.size);
    this.jet = new Float32Array(this.size);
    this.dc = new DcBlock(sampleRate, 30);
    this.energyK = 1 - Math.exp(-1 / (0.03 * sampleRate));
  }

  /** The pipe's delay that puts the loop's period exactly on the note. */
  private delayFor(midi: number): number {
    const f = hz(midi);
    const w = (2 * Math.PI * f) / this.rate;
    const d = this.rate / f - lowpassDelay(END_DULL, w);
    return Math.max(2, Math.min(this.size - 3, d));
  }

  protected start(midi: number, velocity: number): void {
    if (this.rate / hz(midi) < 6) return;
    // while the pipe still sounds, the new length is reached by a glide (a slur), never a jump
    const sounding = this.playing && (this.breath > 0.05 || this.energy > 1e-9);
    if (this.midi >= 0) this.trims[Math.max(0, Math.min(127, Math.round(this.midi)))] = this.trim;
    this.midi = midi;
    this.delayTarget = this.delayFor(midi);
    this.jetShare = midi <= 84 ? JET_LOW : midi >= 90 ? JET_HIGH : JET_LOW + ((JET_HIGH - JET_LOW) * (midi - 84)) / 6;
    const key = Math.max(0, Math.min(127, Math.round(midi)));
    this.trim = this.trims[key];
    this.lastCross = -1;
    this.error = 0;
    this.crossings = 0;
    if (!sounding) {
      this.delay = this.delayTarget + this.trim;
      this.held = 0;
    }
    // a stronger breath, a louder note; the jet's speed barely changes, so the note stays where it is
    this.breathTarget = 0.6 + 0.15 * velocity;
    this.level = 0.45 + 0.55 * velocity;
    this.playing = true;
  }

  protected stop(midi: number): void {
    if (midi !== this.midi) return;
    this.breathTarget = 0;
  }

  protected silence(): void {
    this.bore.fill(0);
    this.jet.fill(0);
    this.breath = this.breathTarget = 0;
    this.playing = false;
    this.energy = 0;
    this.y1 = 0;
  }

  protected control(): void {
    if (!this.playing) return;
    const h = CONTROL / this.rate;
    // breath comes in over about 40 ms and goes in about 50
    const k = 1 - Math.exp(-h / (this.breathTarget > this.breath ? 0.04 : 0.05));
    this.breath += (this.breathTarget - this.breath) * k;
    // a slur (and every trim) takes about 20 ms
    this.delay += (this.delayTarget + this.trim - this.delay) * (1 - Math.exp(-h / 0.02));
    // the ear: half of the period's error is taken off the pipe's length each time it is heard
    if (this.crossings >= 2 && Math.abs(this.delay - this.delayTarget - this.trim) < 0.01 * this.delayTarget) {
      this.trim -= 0.5 * (this.error / this.crossings);
      const most = 0.04 * this.delayTarget;
      if (this.trim > most) this.trim = most;
      if (this.trim < -most) this.trim = -most;
    }
    if (this.crossings >= 2) {
      this.error = 0;
      this.crossings = 0;
    }
    this.held += h;
    this.keep += ((this.breathTarget > 0 ? END_KEEP : END_KEEP_AFTER) - this.keep) * (1 - Math.exp(-h / 0.03));
    this.phase += 2 * Math.PI * VIBRATO_RATE * h;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    if (this.breathTarget === 0 && this.breath < 1e-4 && this.energy < 1e-11) this.playing = false;
  }

  protected play(out: Float32Array, from: number, count: number): void {
    if (!this.playing) return;
    const bore = this.bore;
    const jet = this.jet;
    const size = this.size;
    const k = this.energyK;
    let w = this.w;
    let y1 = this.y1;
    let energy = this.energy;
    let d = this.delay;
    if (d < 2) d = 2;
    if (d > size - 3) d = size - 3;
    const id = Math.floor(d);
    const fd = d - id;
    const j = d * this.jetShare;
    const ij = Math.floor(j);
    const fj = j - ij;
    // vibrato swells in after a held note's first 300 ms
    const swell = Math.min(1, Math.max(0, (this.held - 0.3) / 0.4));
    const breath = this.breath * (1 + VIBRATO_DEPTH * swell * Math.sin(this.phase));
    const noise = this.noise;
    const keep = this.keep;
    let jetOut = this.lastJet;
    // the ear listens to the pipe without its steady part and through two lowpasses, so only
    // the fundamental crosses zero
    const period = this.delayTarget + lowpassDelay(END_DULL, (2 * Math.PI) / this.delayTarget);
    const ear = Math.exp((-2 * Math.PI * 0.7) / period);
    const settle = Math.exp((-2 * Math.PI * 20) / this.rate);
    let heard = this.heard;
    let heard2 = this.heard2;
    let steady = this.steady;
    let before = this.heardBefore;
    for (let i = 0; i < count; i++) {
      let a = w - id;
      if (a < 0) a += size;
      let b = a - 1;
      if (b < 0) b += size;
      const fromPipe = bore[a] * (1 - fd) + bore[b] * fd;
      // a round trip of a pipe open at both ends: two inverting reflections, the highs lost
      const lp = (1 - END_DULL) * fromPipe + END_DULL * y1;
      y1 = lp;
      const back = keep * lp;
      // the jet, deflected by the sound at the mouth hole, travels to the edge
      jet[w] = breath * (1 + BREATH_NOISE * noise.next()) - DEFLECT * back;
      a = w - ij;
      if (a < 0) a += size;
      b = a - 1;
      if (b < 0) b += size;
      let x = jet[a] * (1 - fj) + jet[b] * fj;
      if (x > 1) x = 1;
      else if (x < -1) x = -1;
      // the edge: the share blown in saturates both ways
      jetOut = x - x * x * x;
      bore[w] = DRIVE * jetOut + back;
      out[from + i] += fromPipe * this.level;
      steady = (1 - settle) * fromPipe + settle * steady;
      heard = (1 - ear) * (fromPipe - steady) + ear * heard;
      heard2 = (1 - ear) * heard + ear * heard2;
      if (before < 0 && heard2 >= 0) {
        const at = this.now + i - heard2 / (heard2 - before);
        const swing = at - this.lastCross;
        if (this.lastCross >= 0 && swing > 0.8 * period && swing < 1.25 * period) {
          this.error += swing - period;
          this.crossings++;
        }
        this.lastCross = at;
      }
      before = heard2;
      energy += k * (fromPipe * fromPipe - energy);
      if (++w === size) w = 0;
    }
    this.w = w;
    this.y1 = y1;
    this.energy = energy;
    this.lastJet = jetOut;
    this.heard = heard;
    this.heard2 = heard2;
    this.steady = steady;
    this.heardBefore = before;
  }

  protected finish(x: number): number {
    return this.dc.step(x) * 0.14;
  }

  protected sounding(): number {
    return this.playing ? 1 : 0;
  }

  protected shape(into: Float32Array): void {
    // the pressure along the pipe: the wave going down plus the one coming back
    let peak = 1e-9;
    const half = this.delay / 2;
    for (let k = 0; k < 32; k++) {
      const along = (k / 31) * half;
      let a = this.w - 1 - Math.round(along);
      let b = this.w - 1 - Math.round(this.delay - along);
      while (a < 0) a += this.size;
      while (b < 0) b += this.size;
      const p = this.bore[a] + this.bore[b];
      into[8 + k] = p;
      if ((p < 0 ? -p : p) > peak) peak = p < 0 ? -p : p;
    }
    for (let k = 0; k < 32; k++) into[8 + k] /= peak;
    into[40] = this.breath;
    into[41] = this.lastJet;
  }
}
