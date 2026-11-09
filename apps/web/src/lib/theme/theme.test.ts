import { describe, it, expect, vi } from "vitest";
import {
  resolveThemePref,
  resolveMode,
  migrateStoredTheme,
  watchSystemMode,
} from "./theme.js";

describe("resolveThemePref", () => {
  it("uses a valid stored value", () => {
    expect(resolveThemePref("dark", null)).toBe("dark");
  });
  it("account pref wins over stored", () => {
    expect(resolveThemePref("light", "dark")).toBe("dark");
  });
  it("defaults to system", () => {
    expect(resolveThemePref(null, null)).toBe("system");
    expect(resolveThemePref("neon", "blurple")).toBe("system");
  });
  it("treats legacy sepia from either source as system", () => {
    expect(resolveThemePref("sepia", null)).toBe("system");
    expect(resolveThemePref(null, "sepia")).toBe("system");
  });
});

describe("resolveMode", () => {
  it("follows the system for system", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });
  it("explicit pref ignores the system", () => {
    expect(resolveMode("light", true)).toBe("light");
  });
});

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("migrateStoredTheme", () => {
  it("drops a legacy light", () => {
    const s = fakeStorage({ theme: "light" });
    migrateStoredTheme(s);
    expect(s.getItem("theme")).toBeNull();
    expect(s.getItem("theme-v")).toBe("2");
  });
  it("drops sepia", () => {
    const s = fakeStorage({ theme: "sepia" });
    migrateStoredTheme(s);
    expect(s.getItem("theme")).toBeNull();
  });
  it("keeps dark", () => {
    const s = fakeStorage({ theme: "dark" });
    migrateStoredTheme(s);
    expect(s.getItem("theme")).toBe("dark");
  });
  it("honors the version marker on a second run", () => {
    const s = fakeStorage({ theme: "light" });
    migrateStoredTheme(s);
    s.setItem("theme", "light");
    migrateStoredTheme(s);
    expect(s.getItem("theme")).toBe("light");
  });
});

describe("watchSystemMode", () => {
  it("calls back on change and unsubscribes", () => {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) =>
        listeners.add(l),
      removeEventListener: (_: string, l: (e: { matches: boolean }) => void) =>
        listeners.delete(l),
    }));
    const cb = vi.fn();
    const off = watchSystemMode(cb);
    listeners.forEach((l) => l({ matches: true }));
    expect(cb).toHaveBeenCalledWith(true);
    off();
    expect(listeners.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
