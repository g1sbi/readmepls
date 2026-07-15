export interface Chunk {
  index: number;
  charStart: number;
  charEnd: number;
  text: string;
}

/**
 * Split text into overlapping character windows for embedding. Windows are sized
 * in characters (~4 chars/token) to approximate the ~512-token budget of the
 * embedding model; the default 2000/200 ≈ 500-token windows with ~50-token overlap
 * so a passage that straddles a boundary is still captured whole in one window.
 * `text.slice(charStart, charEnd) === text` for every chunk by construction — no
 * trimming — so offsets can deep-link back into the source.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlapChars?: number } = {}
): Chunk[] {
  const maxChars = opts.maxChars ?? 2000;
  const overlapChars = opts.overlapChars ?? 200;
  const chunks: Chunk[] = [];
  if (text.length === 0) return chunks;

  let start = 0;
  let index = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // snap back to a whitespace boundary so we don't cut mid-word (unless the
    // whole window is one long token, in which case keep the hard cut)
    if (end < text.length) {
      const ws = text.lastIndexOf(" ", end);
      if (ws > start) end = ws;
    }
    chunks.push({ index: index++, charStart: start, charEnd: end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
