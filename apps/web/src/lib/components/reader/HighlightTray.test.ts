import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightTray from "./HighlightTray.svelte";

const mount = () => {
  const onpick = vi.fn();
  const oncancel = vi.fn();
  const r = render(HighlightTray, { onpick, oncancel });
  return { onpick, oncancel, ...r };
};

describe("HighlightTray", () => {
  it("offers the three Marker colors", () => {
    mount();
    for (const name of ["Yellow", "Rose", "Mint"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("rings Yellow as the primary color", () => {
    mount();
    expect(screen.getByRole("button", { name: "Yellow" })).toHaveAttribute(
      "data-primary",
      "true",
    );
  });

  it("carries a note typed before the color is picked", async () => {
    const { onpick } = mount();
    await fireEvent.input(screen.getByLabelText("Add a note (optional)"), {
      target: { value: "look this up" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Mint" }));
    expect(onpick).toHaveBeenCalledWith("sage", "look this up");
  });

  it("gives up the selection from Close", async () => {
    const { oncancel } = mount();
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(oncancel).toHaveBeenCalled();
  });
});
