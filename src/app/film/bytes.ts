// Writing container files: small fields packed big-endian, and nested boxes (MP4) or elements
// (WebM) whose sizes are only known once what is inside them is. A file is built as a tree, then
// laid out as a list of byte arrays, so the encoded frames themselves are never copied: the list
// goes straight into a Blob.

/** A run of bytes, or a container around more of them. */
export type Piece = Uint8Array | Tree;

export interface Tree {
  /** The container's own header, given the size of everything inside it. */
  head(content: number): Uint8Array;
  kids: Piece[];
}

const sizes = new WeakMap<Tree, number>();

/** The size of a piece, header included. */
export function measure(piece: Piece): number {
  if (piece instanceof Uint8Array) return piece.length;
  const known = sizes.get(piece);
  if (known !== undefined) return known;
  let content = 0;
  for (const kid of piece.kids) content += measure(kid);
  const total = piece.head(content).length + content;
  sizes.set(piece, total);
  return total;
}

/** Lay a piece out, in order, onto `out`. */
export function flatten(piece: Piece, out: Uint8Array[] = []): Uint8Array[] {
  if (piece instanceof Uint8Array) {
    out.push(piece);
    return out;
  }
  let content = 0;
  for (const kid of piece.kids) content += measure(kid);
  out.push(piece.head(content));
  for (const kid of piece.kids) flatten(kid, out);
  return out;
}

/** One array holding all of them. */
export function join(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Packs fields one after another, growing as it goes. */
export class Writer {
  private buf = new Uint8Array(64);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private room(n: number): number {
    if (this.length + n > this.buf.length) {
      const bigger = new Uint8Array(Math.max(this.buf.length * 2, this.length + n));
      bigger.set(this.buf);
      this.buf = bigger;
      this.view = new DataView(bigger.buffer);
    }
    const at = this.length;
    this.length += n;
    return at;
  }

  u8(v: number): this {
    this.buf[this.room(1)] = v & 0xff;
    return this;
  }
  u16(v: number): this {
    // The room first: making it may replace the view.
    const at = this.room(2);
    this.view.setUint16(at, v);
    return this;
  }
  i16(v: number): this {
    const at = this.room(2);
    this.view.setInt16(at, v);
    return this;
  }
  u24(v: number): this {
    const at = this.room(3);
    this.buf[at] = (v >>> 16) & 0xff;
    this.buf[at + 1] = (v >>> 8) & 0xff;
    this.buf[at + 2] = v & 0xff;
    return this;
  }
  u32(v: number): this {
    const at = this.room(4);
    this.view.setUint32(at, v >>> 0);
    return this;
  }
  i32(v: number): this {
    const at = this.room(4);
    this.view.setInt32(at, v);
    return this;
  }
  /** Up to 2^53, which is all a file of ours will need. */
  u64(v: number): this {
    const at = this.room(8);
    this.view.setUint32(at, Math.floor(v / 2 ** 32));
    this.view.setUint32(at + 4, v >>> 0);
    return this;
  }
  f64(v: number): this {
    const at = this.room(8);
    this.view.setFloat64(at, v);
    return this;
  }
  /** Latin text, one byte a letter (box types, codec names). */
  text(s: string): this {
    const at = this.room(s.length);
    for (let i = 0; i < s.length; i++) this.buf[at + i] = s.charCodeAt(i) & 0xff;
    return this;
  }
  bytes(b: Uint8Array): this {
    this.buf.set(b, this.room(b.length));
    return this;
  }
  zeros(n: number): this {
    this.room(n);
    return this;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** A few fields, packed. */
export function pack(fill: (w: Writer) => void): Uint8Array {
  const w = new Writer();
  fill(w);
  return w.done();
}
