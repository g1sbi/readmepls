import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Turndown bundles its own DOM (domino), so this runs in plain Node without jsdom.
const service = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
service.use(gfm);

/** Pure: convert sanitized article HTML into GitHub-flavored Markdown. */
export function htmlToMarkdown(html: string): string {
  return service.turndown(html).trim();
}
