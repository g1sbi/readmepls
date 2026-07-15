/** Scale a vector to unit L2 length. Zero vectors are returned unchanged. */
export function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

/**
 * Dot product. For L2-normalized inputs this equals cosine similarity, which is
 * how stored (already-normalized) vectors are ranked — no per-query normalization.
 */
export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}
