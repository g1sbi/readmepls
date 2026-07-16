import { describe, it, expect, beforeEach } from "vitest";
import {
  loadRecentSearches,
  pushRecentSearch,
  clearRecentSearches,
} from "./recent-searches.js";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("recent-searches", () => {
  let s: Storage;
  beforeEach(() => {
    s = memStorage();
  });

  it("starts empty", () => {
    expect(loadRecentSearches(s)).toEqual([]);
  });

  it("pushes most-recent-first", () => {
    pushRecentSearch("rust", s);
    pushRecentSearch("svelte", s);
    expect(loadRecentSearches(s)).toEqual(["svelte", "rust"]);
  });

  it("de-duplicates and re-promotes an existing query", () => {
    pushRecentSearch("rust", s);
    pushRecentSearch("svelte", s);
    pushRecentSearch("rust", s);
    expect(loadRecentSearches(s)).toEqual(["rust", "svelte"]);
  });

  it("caps at 5 and trims/ignores blank", () => {
    for (const q of ["a", "b", "c", "d", "e", "f"]) pushRecentSearch(q, s);
    expect(loadRecentSearches(s)).toEqual(["f", "e", "d", "c", "b"]);
    expect(pushRecentSearch("   ", s)).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("clears", () => {
    pushRecentSearch("rust", s);
    clearRecentSearches(s);
    expect(loadRecentSearches(s)).toEqual([]);
  });

  it("returns [] on corrupt stored data", () => {
    s.setItem("readmepls:recent-searches", "{not json");
    expect(loadRecentSearches(s)).toEqual([]);
  });
});
