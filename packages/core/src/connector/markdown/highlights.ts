import type { Highlight } from "@readmepls/types";

export interface HighlightResult {
  body: string;
  unanchored: Highlight[];
}

/** Best-effort inline `==mark==` of each highlight's text in the markdown body.
 *  Offsets do not survive HTML→MD conversion, so this matches on text, using
 *  prefix/suffix to disambiguate repeats. Highlights whose text can't be found
 *  are returned as `unanchored` for the fallback section — never dropped. */
export function markHighlights(body: string, highlights: Highlight[]): HighlightResult {
  let out = body;
  const unanchored: Highlight[] = [];
  for (const h of highlights) {
    const idx = locate(out, h.text, h.prefix, h.suffix);
    if (idx < 0) {
      unanchored.push(h);
      continue;
    }
    out = out.slice(0, idx) + "==" + h.text + "==" + out.slice(idx + h.text.length);
  }
  return { body: out, unanchored };
}

function locate(body: string, text: string, prefix: string, suffix: string): number {
  if (!text) return -1;
  const matches: number[] = [];
  let from = 0;
  for (;;) {
    const i = body.indexOf(text, from);
    if (i < 0) break;
    matches.push(i);
    from = i + text.length;
  }
  if (matches.length === 0) return -1;
  if (matches.length === 1) return matches[0]!;
  for (const i of matches) {
    const before = body.slice(Math.max(0, i - prefix.length), i);
    const after = body.slice(i + text.length, i + text.length + suffix.length);
    if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) return i;
  }
  return matches[0]!;
}

/** A trailing `## Highlights` section for highlights that couldn't be anchored
 *  inline. Empty string when the list is empty. */
export function highlightsSection(highlights: Highlight[]): string {
  if (highlights.length === 0) return "";
  const blocks = highlights.map((h) => (h.note ? `> ${h.text}\n>\n> — ${h.note}` : `> ${h.text}`));
  return "## Highlights\n\n" + blocks.join("\n\n");
}
