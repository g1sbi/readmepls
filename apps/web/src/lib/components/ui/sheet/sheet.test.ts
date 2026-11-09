import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SheetHarness from "./sheet-harness.svelte";

const read = (f: string) =>
  readFileSync(resolve(import.meta.dirname, f), "utf8");

describe("Sheet", () => {
  it("sheet has a visible Close button and a title", () => {
    render(SheetHarness);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("closing calls onClose", async () => {
    const onClose = vi.fn();
    render(SheetHarness, { onClose });
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("side sheets use the Marker shell", () => {
    const cls = read("sheet-content.svelte");
    for (const c of [
      "bg-background",
      "ring-hairline",
      "w-[min(22rem,90vw)]",
      "slide-in-from-right",
      "slide-in-from-left",
      "ease-out",
      "duration-[var(--dur-slow)]",
    ])
      expect(cls).toContain(c);
  });

  it("bottom sheet respects the safe area", () => {
    const cls = read("sheet-content.svelte");
    expect(cls).toContain("rounded-t-xl");
    expect(cls).toContain("env(safe-area-inset-bottom)");
  });

  it("overlay uses the scrim token", () => {
    expect(read("sheet-overlay.svelte")).toContain("bg-scrim");
  });
});
