// Which held note each of the six voices sings. Every note gets as many voices in unison as the
// tone asks for and the seats allow: one note may have all six, six notes one each. A voice keeps
// its note for as long as the note is held and still wants it, so a held chord does not shuffle
// when another key goes down; only the extra unison voices move over to make room.

/** The note each seat sings now, or null: from what it sang before and the notes held, oldest first. */
export function assign(before: readonly (number | null)[], held: readonly number[], unison: number): (number | null)[] {
  const seats = before.length;
  const notes = held.slice(-seats);
  const next: (number | null)[] = new Array(seats).fill(null);
  if (!notes.length) return next;
  const per = Math.max(1, Math.min(Math.round(unison), Math.floor(seats / notes.length)));
  const count = new Map<number, number>();
  const take = (seat: number, note: number) => {
    next[seat] = note;
    count.set(note, (count.get(note) ?? 0) + 1);
  };
  // Voices that are singing a note still held keep it, as many as the note still wants.
  before.forEach((note, seat) => {
    if (note !== null && notes.includes(note) && (count.get(note) ?? 0) < per) take(seat, note);
  });
  // The notes still short of voices take free seats: silent ones first, then ones dying away.
  for (const note of notes) {
    while ((count.get(note) ?? 0) < per) {
      let free = next.findIndex((n, seat) => n === null && before[seat] === null);
      if (free < 0) free = next.indexOf(null);
      if (free < 0) break;
      take(free, note);
    }
  }
  return next;
}

/** Where a seat stands among the voices singing its note: its index and how many there are. */
export function unisonOf(notes: readonly (number | null)[], seat: number): { index: number; count: number } {
  const note = notes[seat];
  if (note === null) return { index: 0, count: 1 };
  let index = 0;
  let count = 0;
  notes.forEach((n, k) => {
    if (n !== note) return;
    if (k < seat) index++;
    count++;
  });
  return { index, count };
}
