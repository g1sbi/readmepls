import type { LibraryParams } from "@readmepls/types";

/** Merge a filter patch. Any change other than pagination resets page to 1. */
export function applyPatch(current: LibraryParams, patch: Partial<LibraryParams>): LibraryParams {
  const isPageOnly = Object.keys(patch).length === 1 && "page" in patch;
  return { ...current, ...patch, page: isPageOnly ? (patch.page ?? current.page) : 1 };
}
