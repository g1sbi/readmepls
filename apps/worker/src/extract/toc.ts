import { JSDOM } from "jsdom";
import {
  slugify,
  nestHeadings,
  makeIdDeduper,
  type FlatHeading,
} from "@readmepls/core";
import type { TocEntry } from "@readmepls/types";

/** Parse sanitized article HTML, assign stable slug ids to h1–h6 (keeping any
 *  id already present), and return the id-annotated HTML plus a nested outline. */
export function buildToc(html: string): { html: string; toc: TocEntry[] } {
  if (!html.trim()) return { html, toc: [] };
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;
  const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  if (headings.length === 0) return { html, toc: [] };

  const dedupe = makeIdDeduper();
  const flat: FlatHeading[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? "").trim();
    if (!text) continue;
    const level = Number(h.tagName[1]);
    const id = h.getAttribute("id") || dedupe(slugify(text));
    h.setAttribute("id", id);
    flat.push({ id, text, level });
  }
  return { html: doc.body.innerHTML, toc: nestHeadings(flat) };
}
