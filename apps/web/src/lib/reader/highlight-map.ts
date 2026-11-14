/** A highlight's first mark, in document (not viewport) coordinates. */
export interface MarkTop {
  id: string;
  top: number;
}

/** Where a highlight sits along the article, as a share of its height. */
export interface MapPosition {
  id: string;
  at: number;
}

/**
 * Lay the highlights out along the map's track. Orphans never reach here —
 * they have no mark to measure — so the map simply doesn't draw them.
 */
export function mapPositions(
  items: MarkTop[],
  docHeight: number,
): MapPosition[] {
  if (docHeight <= 0) return [];
  return items
    .map(({ id, top }) => ({
      id,
      at: Math.min(1, Math.max(0, top / docHeight)),
    }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Measure every highlight's first mark. A highlight that wraps across block
 * elements renders as several marks; the first one is where it starts, which
 * is what the map points at.
 */
export function measureMarks(root: HTMLElement): MarkTop[] {
  const seen = new Set<string>();
  const out: MarkTop[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("mark[data-hl-id]")) {
    const id = el.dataset.hlId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, top: el.getBoundingClientRect().top + window.scrollY });
  }
  return out;
}
