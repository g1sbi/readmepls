import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightPopover from "./HighlightPopover.svelte";

describe("HighlightPopover", () => {
  it("emits the chosen color and note", async () => {
    const onpick = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /amber/i }));
    expect(onpick).toHaveBeenCalledWith("amber", "");
  });

  it("fires oncancel when Escape is pressed", async () => {
    const oncancel = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick: vi.fn(), oncancel });
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(oncancel).toHaveBeenCalledOnce();
  });
});
