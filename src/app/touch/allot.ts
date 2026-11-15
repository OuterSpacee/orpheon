// Which voice sings which held note. With one voice the newest note wins and, when it lets go,
// the voice falls back to the one held before it, as a monophonic instrument does. With more, a
// voice keeps its note for as long as the key is down, so a held chord does not shuffle.

export class Allotment {
  /** The note each voice has, or null. */
  readonly notes: (number | null)[];
  /** Every held note, oldest first. */
  private readonly held: number[] = [];

  constructor(voices: number) {
    this.notes = new Array(voices).fill(null);
  }

  /** A key went down. Returns the voice that took it. */
  press(note: number): number {
    this.release(note);
    this.held.push(note);
    let voice = this.notes.indexOf(null);
    if (voice < 0) {
      // Everyone is busy: the voice holding the oldest note gives it up.
      const oldest = this.held.find((n) => this.notes.includes(n))!;
      voice = this.notes.indexOf(oldest);
    }
    this.notes[voice] = note;
    return voice;
  }

  /** A key came up. Returns the voice that changed, or -1. */
  release(note: number): number {
    const at = this.held.indexOf(note);
    if (at < 0) return -1;
    this.held.splice(at, 1);
    const voice = this.notes.indexOf(note);
    if (voice < 0) return -1;
    // Hand the freed voice the newest held note that nobody is singing.
    const waiting = [...this.held].reverse().find((n) => !this.notes.includes(n));
    this.notes[voice] = waiting ?? null;
    return voice;
  }

  clear(): void {
    this.held.length = 0;
    this.notes.fill(null);
  }

  get any(): boolean {
    return this.held.length > 0;
  }
}

/** Where voice `i` of `count` stands, left (-1) to right (+1), and how loud each should be. */
export function seating(i: number, count: number): { place: number; level: number } {
  return {
    place: count < 2 ? 0 : -0.7 + (1.4 * i) / (count - 1),
    // Voices add up, so each of many is quieter: six together are a little louder than one alone.
    level: 0.8 / Math.max(1, count) ** 0.4,
  };
}
