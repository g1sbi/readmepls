import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

vi.mock("svelte/reactivity", async (orig) => ({
  ...(await orig<typeof import("svelte/reactivity")>()),
  MediaQuery: class {
    current = false;
  },
}));

import PageHeader from "./PageHeader.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

describe("PageHeader", () => {
  beforeEach(() => {
    searchPalette.close();
  });

  it("renders the title as the h1", () => {
    render(PageHeader, { title: "Library" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeInTheDocument();
  });

  it("opens the search palette", async () => {
    const spy = vi.spyOn(searchPalette, "open");
    render(PageHeader, { title: "Library" });
    await fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(spy).toHaveBeenCalled();
  });

  it("opens the capture sheet from Save a link", async () => {
    render(PageHeader, { title: "Library" });
    expect(screen.queryByPlaceholderText("Paste a link")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Save a link" }));
    expect(
      await screen.findByPlaceholderText("Paste a link"),
    ).toBeInTheDocument();
  });

  it("makes both buttons 44px", () => {
    render(PageHeader, { title: "Library" });
    for (const name of ["Search", "Save a link"])
      expect(
        screen.getByRole("button", { name }).className.split(/\s+/),
      ).toContain("size-11");
  });
});
