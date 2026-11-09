import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderHeader from "./ReaderHeader.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

const mount = (over: Record<string, unknown> = {}) => {
  const onMenu = vi.fn();
  const r = render(ReaderHeader, {
    backHref: "/collections/physics",
    hidden: false,
    onMenu,
    ...over,
  } as never);
  return { onMenu, ...r };
};

describe("ReaderHeader", () => {
  beforeEach(() => {
    searchPalette.close();
    document.documentElement.style.removeProperty("--topbar-h");
  });

  it("links Back to the given origin", () => {
    mount();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/collections/physics",
    );
  });

  it("opens the search palette", async () => {
    const spy = vi.spyOn(searchPalette, "open");
    mount();
    await fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(spy).toHaveBeenCalled();
  });

  it("opens the navigation from Menu", async () => {
    const { onMenu } = mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "Open navigation" }),
    );
    expect(onMenu).toHaveBeenCalled();
  });

  it("slides away on phones only when hidden", async () => {
    const { container, rerender } = mount();
    const header = container.querySelector("header")!;
    expect(header.className).not.toMatch(/-translate-y-full/);
    await rerender({ hidden: true });
    expect(header.className.split(/\s+/)).toContain("max-md:-translate-y-full");
    expect(header.className.split(/\s+/)).toContain(
      "motion-reduce:transition-none",
    );
  });

  it("gives every control a 44px target", () => {
    mount();
    expect(screen.getByRole("link", { name: "Back" }).className).toMatch(
      /\bh-11\b/,
    );
    for (const name of ["Search", "Open navigation"])
      expect(
        screen.getByRole("button", { name }).className.split(/\s+/),
      ).toContain("size-11");
  });

  // The reader's sticky rail and highlights column pin below this bar.
  it("publishes its height as --topbar-h", () => {
    mount();
    expect(
      document.documentElement.style.getPropertyValue("--topbar-h"),
    ).not.toBe("");
  });
});
