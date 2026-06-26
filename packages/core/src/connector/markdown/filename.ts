import { slugify } from "../../slug.js";

/** Deterministic `<slug>.md`. On collision within a batch, append a short stable
 *  id suffix so re-export of the same set produces the same name. */
export function exportFilename(title: string, idSuffix: string, used: Set<string>): string {
  const base = slugify(title) || "untitled";
  let name = `${base}.md`;
  if (used.has(name)) name = `${base}-${idSuffix}.md`;
  used.add(name);
  return name;
}
