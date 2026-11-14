import {
  slugify,
  nestHeadings,
  makeIdDeduper,
  type FlatHeading,
} from "@readmepls/core";
import type { TocEntry } from "@readmepls/types";

/** Build a toc from already-rendered article HTML. Assigns slug ids to any
 *  heading missing one (mutating the DOM) so click-to-jump has a target. Used
 *  only when a content record carries no worker-emitted toc. */
export function buildTocFromDom(root: HTMLElement): TocEntry[] {
  const headings = [...root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")];
  const existingIds = headings
    .map((h) => h.getAttribute("id"))
    .filter((v): v is string => !!v);
  const dedupe = makeIdDeduper(existingIds);
  const flat: FlatHeading[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? "").trim();
    if (!text) continue;
    const level = Number(h.tagName[1]);
    let id = h.getAttribute("id");
    if (!id) {
      id = dedupe(slugify(text));
      h.setAttribute("id", id);
    }
    flat.push({ id, text, level });
  }
  return nestHeadings(flat);
}

/** A toc entry lifted out of the tree, with how deep it sat. */
export interface FlatTocEntry {
  id: string;
  text: string;
  level: number;
  depth: number;
}

/**
 * Depth-first flattening of a toc tree. The chapter ticks need one row per
 * entry in reading order; the tree shape only survives as `depth` (indent).
 */
export function flattenToc(items: TocEntry[], depth = 0): FlatTocEntry[] {
  return items.flatMap((n) => [
    { id: n.id, text: n.text, level: n.level, depth },
    ...flattenToc(n.children, depth + 1),
  ]);
}
