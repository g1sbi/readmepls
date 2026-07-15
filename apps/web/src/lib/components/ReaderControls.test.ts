import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControls from "./ReaderControls.svelte";

const prefs = { font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light" } as const;

describe("ReaderControls", () => {
  it("does not render theme buttons (theme lives in the header)", () => {
    render(ReaderControls, { prefs, onChange: vi.fn() });
    expect(screen.queryByRole("button", { name: /dark/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sepia/i })).not.toBeInTheDocument();
  });

  it("emits a larger size when increasing font size", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: "increase text size" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ size: 19 }));
  });

  it("toggles the font family", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /serif|sans/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ font: "serif" }));
  });

  it("labels the size steppers for assistive tech", () => {
    render(ReaderControls, { prefs, onChange: vi.fn() });
    expect(screen.getByRole("button", { name: "decrease text size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "increase text size" })).toBeInTheDocument();
  });

  it("renders the three controls as one segmented group", () => {
    const { container } = render(ReaderControls, { prefs, onChange: vi.fn() });
    const group = container.querySelector(".controls");
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll("button.seg")).toHaveLength(3);
  });
});
