import {
  describeTextQuote,
  createTextQuoteSelectorMatcher,
  describeTextPosition,
} from "@apache-annotator/dom";
import type { HighlightSelector } from "@readmepls/types";

/** A Range selecting all of `root`'s contents — the anchoring scope. */
export function rangeOver(root: Node): Range {
  const r = (root.ownerDocument ?? document).createRange();
  r.selectNodeContents(root);
  return r;
}

/** Build a portable selector (quote + prefix/suffix + char offsets) for `target`. */
export async function describe(scope: Range, target: Range): Promise<HighlightSelector> {
  // apache-annotator: describeTextQuote(range, scope?)
  const quote = await describeTextQuote(target, scope);
  const pos = await describeTextPosition(target, scope);
  return {
    text: quote.exact,
    prefix: quote.prefix ?? "",
    suffix: quote.suffix ?? "",
    startOffset: pos.start,
    endOffset: pos.end,
  };
}

/** Re-locate a selector in `scope`. Returns the first matching Range, or null. */
export async function anchor(scope: Range, sel: HighlightSelector): Promise<Range | null> {
  // apache-annotator: createTextQuoteSelectorMatcher(selector) returns a Matcher
  // Matcher<Node | Range, Range> — call it with scope, returns async iterable
  const matcher = createTextQuoteSelectorMatcher({
    type: "TextQuoteSelector",
    exact: sel.text,
    prefix: sel.prefix,
    suffix: sel.suffix,
  });
  for await (const range of matcher(scope)) {
    return range;
  }
  return null;
}
