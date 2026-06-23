import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControls from "./ReaderControls.svelte";

const prefs = { font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light" } as const;

describe("ReaderControls", () => {
  it("emits an updated prefs object when the theme changes", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /dark/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("emits a larger size when increasing font size", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /A\+|increase/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ size: 19 }));
  });
});
