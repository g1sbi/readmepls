import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import TopBar from "./TopBar.svelte";

describe("TopBar", () => {
  it("has a library link but no redundant extract link", () => {
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    expect(screen.getByRole("link", { name: /library/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /extract/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /readmepls/i })).toHaveAttribute("href", "/");
  });
});
