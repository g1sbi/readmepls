import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";
import ConfirmAction from "./ConfirmAction.svelte";

const base = {
  title: "Delete this article?",
  message: "This can't be undone.",
  open: true,
};

describe("ConfirmAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirm calls onConfirm once", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(ConfirmAction, { ...base, onConfirm, onCancel });
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel button calls onCancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(ConfirmAction, { ...base, onConfirm, onCancel });
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape cancels, never confirms", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(ConfirmAction, { ...base, onConfirm, onCancel });
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("buttons are destructive + outline and at least 44px", () => {
    render(ConfirmAction, { ...base, onConfirm: vi.fn(), onCancel: vi.fn() });
    const confirm = screen.getByRole("button", { name: "Delete" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(confirm.className).toContain("bg-destructive");
    expect(cancel.className).toContain("ring-hairline");
    expect(confirm.className).toContain("h-11");
    expect(cancel.className).toContain("h-11");
  });

  it("uses a custom confirm label", () => {
    render(ConfirmAction, {
      ...base,
      confirmLabel: "Remove",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(ConfirmAction, {
      ...base,
      open: false,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(screen.queryByText("This can't be undone.")).not.toBeInTheDocument();
  });

  it("the hand-rolled ConfirmDialog is gone", () => {
    const root = resolve(import.meta.dirname, "../..");
    const files = globSync("**/*.svelte", { cwd: root });
    expect(files.length).toBeGreaterThan(10);
    expect(files).not.toContain("lib/components/ui/ConfirmDialog.svelte");
    const offenders = files.filter((f) =>
      /ConfirmDialog/.test(readFileSync(resolve(root, f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
