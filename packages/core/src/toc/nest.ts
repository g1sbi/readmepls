import type { TocEntry } from "@readmepls/types";

export interface FlatHeading {
  id: string;
  text: string;
  level: number;
}

/** Build a nested outline from headings in document order. The first heading
 *  always roots the tree, so the shallowest level actually present becomes the
 *  top level; deeper (or skipped-deeper) levels nest under the nearest
 *  shallower ancestor. */
export function nestHeadings(items: FlatHeading[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const it of items) {
    const node: TocEntry = {
      id: it.id,
      text: it.text,
      level: it.level,
      children: [],
    };
    while (stack.length && stack[stack.length - 1]!.level >= node.level)
      stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return roots;
}

/** Returns a function that yields collision-free slug ids: "intro", "intro-2",
 *  … An empty base becomes "section". Pass `reserved` (e.g. ids already present
 *  on other headings) to seed the dedupe table up front, so a later generated
 *  slug never collides with one of those pre-existing ids. */
export function makeIdDeduper(
  reserved?: Iterable<string>,
): (base: string) => string {
  const seen = new Map<string, number>();
  if (reserved) {
    for (const r of reserved) if (r) seen.set(r, (seen.get(r) ?? 0) + 1);
  }
  return (base: string): string => {
    const key = base || "section";
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  };
}
