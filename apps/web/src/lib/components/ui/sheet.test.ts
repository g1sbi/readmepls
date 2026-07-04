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
    await fireEvent.click(getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
