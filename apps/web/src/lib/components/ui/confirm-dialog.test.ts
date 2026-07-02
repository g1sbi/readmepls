import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";

const base = {
  title: "delete this article?",
  message: "this can't be undone.",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and message when open", () => {
    render(ConfirmDialog, { ...base, open: true });
    expect(screen.getByText("delete this article?")).toBeInTheDocument();
    expect(screen.getByText("this can't be undone.")).toBeInTheDocument();
  });

  it("does not render its panel when closed", () => {
    render(ConfirmDialog, { ...base, open: false });
    expect(screen.queryByText("this can't be undone.")).not.toBeInTheDocument();
  });

  it("fires onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(ConfirmDialog, { ...base, open: true, onConfirm });
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("fires onCancel when the cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(ConfirmDialog, { ...base, open: true, onCancel });
    await fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses a custom confirm label when provided", () => {
    render(ConfirmDialog, { ...base, open: true, confirmLabel: "remove" });
    expect(screen.getByRole("button", { name: "remove" })).toBeInTheDocument();
  });

  it("fires onCancel when Escape is pressed", async () => {
    const onCancel = vi.fn();
    render(ConfirmDialog, { ...base, open: true, onCancel });
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
