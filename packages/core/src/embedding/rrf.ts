/**
 * Fuse N ranked id lists into one ranked, de-duplicated list by Reciprocal Rank
 * Fusion. Each id scores the sum, over every list it appears in, of 1/(k + rank),
 * where rank is its 0-based position in that list. Higher score ranks earlier.
 *
 * RRF consumes only rank positions, so lists produced by different scorers
 * (semantic cosine vs FTS rank) fuse without normalizing scores onto a common
 * scale. `k` damps the contribution of low-ranked items; 60 is the standard
 * default. Ties break by first appearance across the lists (stable).
 */
export function reciprocalRankFusion(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank]!;
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    }
  }
  return [...score.keys()].sort((a, b) => {
    const d = score.get(b)! - score.get(a)!;
    return d !== 0 ? d : firstSeen.get(a)! - firstSeen.get(b)!;
  });
}
