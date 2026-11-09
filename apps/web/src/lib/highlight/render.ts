import type { HighlightColor } from "@readmepls/types";

/** Wrap a Range's contents in a <mark> keyed by color. Safe for single-container
 *  ranges (text-quote anchoring yields a contiguous range within the article body).
 *  The band itself is drawn by reading.css from `data-hl-color`. */
export function markRange(
  range: Range,
  color: HighlightColor,
  id: string,
): void {
  const mark = document.createElement("mark");
  mark.dataset.hlId = id;
  mark.dataset.hlColor = color;
  try {
    range.surroundContents(mark);
  } catch {
    // Range spans multiple block elements — fall back to extract+wrap.
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
}

/** Remove all highlight marks under `root`, restoring the original text nodes. */
export function unmarkAll(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll("mark[data-hl-id]"))) {
    const parent = mark.parentNode!;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}
