import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import TopBar from "./TopBar.svelte";

describe("TopBar", () => {
  it("has a library link but no redundant extract link", () => {
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    expect(screen.getByRole("link", { name: /library/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /extract/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /readme.*pls/i })).toHaveAttribute("href", "/");
  });

  it("links to the profile page", () => {
    render(TopBar, { theme: "light", onTheme: vi.fn(), onSignOut: vi.fn() });
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });
});
