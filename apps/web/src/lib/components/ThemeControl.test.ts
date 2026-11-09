import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ThemeControl from "./ThemeControl.svelte";

describe("ThemeControl", () => {
  it("renders the three options with aria-pressed following value", () => {
    render(ThemeControl, { value: "dark", onChange: () => {} });
    expect(screen.getByRole("group", { name: "theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Match system" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("emits the pref on click", async () => {
    const onChange = vi.fn();
    render(ThemeControl, { value: "light", onChange });
    await fireEvent.click(screen.getByRole("button", { name: "Match system" }));
    expect(onChange).toHaveBeenCalledWith("system");
  });
});
