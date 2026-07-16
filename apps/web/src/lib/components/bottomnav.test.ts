import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import BottomNav from "./BottomNav.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

describe("BottomNav", () => {
  it("renders the primary tabs with correct hrefs", () => {
    const { getByRole } = render(BottomNav, { pathname: "/library" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("does not render a profile tab", () => {
    const { queryByRole } = render(BottomNav, { pathname: "/library" });
    expect(queryByRole("link", { name: /profile/i })).not.toBeInTheDocument();
  });

  it("marks the active tab from the pathname", () => {
    const { getByRole } = render(BottomNav, { pathname: "/collections" });
    expect(getByRole("link", { name: /collections/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(getByRole("link", { name: /library/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("treats the reader route as within the library tab", () => {
    const { getByRole } = render(BottomNav, { pathname: "/read/abc123" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the search palette when the search tab is tapped", async () => {
    const spy = vi.spyOn(searchPalette, "open");
    const { getByRole } = render(BottomNav, { pathname: "/library" });
    await fireEvent.click(getByRole("button", { name: /search/i }));
    expect(spy).toHaveBeenCalled();
  });

  it("renders the collections tab", () => {
    const { getByRole } = render(BottomNav, { pathname: "/library" });
    expect(getByRole("link", { name: /collections/i })).toHaveAttribute("href", "/collections");
  });

  it("marks collections active on a collection route", () => {
    const { getByRole } = render(BottomNav, { pathname: "/collections/recipes" });
    expect(getByRole("link", { name: /collections/i })).toHaveAttribute("aria-current", "page");
  });
});
