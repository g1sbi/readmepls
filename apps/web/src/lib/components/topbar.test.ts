import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/svelte";
import TopBar from "./TopBar.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

describe("TopBar", () => {
  it("has a library link but no redundant extract link", () => {
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    expect(screen.getByRole("link", { name: /library/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /extract/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /readme.*pls/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("links to the profile page", () => {
    render(TopBar, { theme: "light", onTheme: vi.fn(), onSignOut: vi.fn() });
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("opens a mobile menu with theme controls and sign out", async () => {
    const onTheme = vi.fn();
    const onSignOut = vi.fn();
    render(TopBar, { theme: "light", onTheme, onSignOut });

    await fireEvent.click(screen.getByRole("button", { name: /^menu$/i }));
    const dialog = screen.getByRole("dialog", { name: /menu/i });

    await fireEvent.click(
      within(dialog).getByRole("button", { name: /dark/i }),
    );
    expect(onTheme).toHaveBeenCalledWith("dark");

    await fireEvent.click(
      within(dialog).getByRole("button", { name: /sign out/i }),
    );
    expect(onSignOut).toHaveBeenCalled();
  });

  it("opens the search palette from the header search trigger", async () => {
    const spy = vi.spyOn(searchPalette, "open");
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    await fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(spy).toHaveBeenCalled();
  });
});
