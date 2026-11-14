import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightPopover from "./HighlightPopover.svelte";

describe("HighlightPopover", () => {
  it("emits the chosen color and note", async () => {
    const onpick = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: "Rose" }));
    expect(onpick).toHaveBeenCalledWith("amber", "");
  });

  it("names swatches by their displayed Marker colors", () => {
    render(HighlightPopover, {
      x: 10,
      y: 10,
      onpick: vi.fn(),
      oncancel: vi.fn(),
    });
    for (const name of ["Yellow", "Rose", "Mint"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("rings Yellow as the primary color", () => {
    render(HighlightPopover, {
      x: 10,
      y: 10,
      onpick: vi.fn(),
      oncancel: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Yellow" })).toHaveAttribute(
      "data-primary",
      "true",
    );
    expect(screen.getByRole("button", { name: "Rose" })).not.toHaveAttribute(
      "data-primary",
    );
  });

  it("carries a note typed before the color is picked", async () => {
    const onpick = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick, oncancel: vi.fn() });
    await fireEvent.input(screen.getByLabelText("Add a note (optional)"), {
      target: { value: "check the derivation" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Rose" }));
    expect(onpick).toHaveBeenCalledWith("amber", "check the derivation");
  });

  it("fires oncancel when Escape is pressed", async () => {
    const oncancel = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick: vi.fn(), oncancel });
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(oncancel).toHaveBeenCalledOnce();
  });
});
