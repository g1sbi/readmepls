import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import BottomSheet from "./BottomSheet.svelte";

describe("BottomSheet", () => {
  it("does not render its header when closed", () => {
    render(BottomSheet, { open: false, onClose: () => {}, title: "text" });
    expect(screen.queryByLabelText("close text")).toBeNull();
  });

  it("renders the title when open", async () => {
    render(BottomSheet, { open: true, onClose: () => {}, title: "chapters" });
    expect(await screen.findByText("chapters")).toBeTruthy();
  });

  it("fires onClose from the close button", async () => {
    const onClose = vi.fn();
    render(BottomSheet, { open: true, onClose, title: "text" });
    await fireEvent.click(await screen.findByLabelText("close text"));
    expect(onClose).toHaveBeenCalled();
  });
});
