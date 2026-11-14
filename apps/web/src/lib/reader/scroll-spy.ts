/** A heading's id with its viewport-relative top, as measured this frame. */
export interface HeadingTop {
  id: string;
  top: number;
}

/** Headings at or above this share of the viewport count as "being read". */
const LINE = 0.3;

/**
 * Which chapter the reader is in. Normally that's the last heading to have
 * crossed the top third of the viewport; at the very bottom of the page it's
 * the last heading on screen, so a short final chapter still becomes current
 * (its heading may never reach the line).
 */
export function activeHeadingId(
  headings: HeadingTop[],
  viewportH: number,
  atBottom: boolean,
): string | null {
  const passed = atBottom
    ? headings.filter((h) => h.top < viewportH)
    : headings.filter((h) => h.top <= viewportH * LINE);
  return passed.length ? passed[passed.length - 1]!.id : null;
}
