import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchKeydown } from "$lib/search/handle-keydown.js";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

describe("handleSearchKeydown", () => {
  beforeEach(() => searchPalette.close());

  it("opens the palette and prevents default on Cmd+K", () => {
    const preventDefault = vi.fn();
    handleSearchKeydown({
      key: "k",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      target: null,
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(searchPalette.isOpen).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("ignores plain keys", () => {
    const preventDefault = vi.fn();
    handleSearchKeydown({
      key: "a",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      target: null,
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(searchPalette.isOpen).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
