import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import Sheet from "./Sheet.svelte";

describe("Sheet", () => {
  it("does not render its region when closed", () => {
    const { queryByRole } = render(Sheet, { open: false, onClose: () => {}, title: "Filters" });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog when open", () => {
    const { getByRole } = render(Sheet, { open: true, onClose: () => {}, title: "Filters" });
    expect(getByRole("dialog", { name: "Filters" })).toBeTruthy();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(Sheet, { open: true, onClose, title: "Filters" });
    await fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(Sheet, { open: true, onClose, title: "Filters" });
    const backdrop = getByTestId("sheet-backdrop");
    // bits-ui's dismissable layer attaches its outside-click listener on a
    // 1ms `setTimeout` after mount and debounces detection by another 10ms,
    // and jsdom's zero-rect getBoundingClientRect() reads a (0,0) event as
    // "inside" the content node — so the event needs a nonzero coordinate
    // and both delays need to elapse around it.
    await new Promise((r) => setTimeout(r, 10));
    await fireEvent.pointerDown(backdrop, { clientX: 100, clientY: 100 });
    await new Promise((r) => setTimeout(r, 20));
    expect(onClose).toHaveBeenCalled();
  });
});
