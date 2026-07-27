/** Prepare a parsed document so Readability preserves its section headings.
 *
 *  Modern MediaWiki (Wikipedia, Fandom, …) renders every heading as
 *  `<div class="mw-heading"><h2 id="…">Title</h2><span class="mw-editsection">[edit]</span></div>`.
 *  Readability's cleanup discards that wrapper — heading and all — so the
 *  extracted article ends up with no headings and the reader shows no chapters.
 *
 *  This runs BEFORE Readability, mutating the document in place: it strips the
 *  "[edit]" chrome and replaces each heading wrapper with the bare heading, so
 *  the heading survives extraction. Pure DOM transform, no network. Safe on
 *  documents without these wrappers — the selectors simply match nothing.
 */
export function preprocessHeadings(doc: Document): void {
  // Drop the "[edit]" section links first so their text can't bleed into the
  // heading's textContent once the wrapper is unwrapped.
  for (const edit of doc.querySelectorAll(".mw-editsection")) {
    edit.remove();
  }
  // Replace each heading wrapper with its heading element.
  for (const wrapper of doc.querySelectorAll("div.mw-heading")) {
    const heading = wrapper.querySelector("h1,h2,h3,h4,h5,h6");
    if (heading) wrapper.replaceWith(heading);
  }
}
