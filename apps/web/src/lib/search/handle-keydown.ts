import { isSearchOpenShortcut } from "./shortcut.js";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

export function handleSearchKeydown(e: KeyboardEvent): void {
  if (!isSearchOpenShortcut(e)) return;
  e.preventDefault();
  searchPalette.open();
}
