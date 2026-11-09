import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import DialogHarness from "./dialog-harness.svelte";

const read = (f: string) =>
  readFileSync(resolve(import.meta.dirname, f), "utf8");

describe("Dialog", () => {
  it("plain dialogs show a visible Close button", () => {
    render(DialogHarness);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toBeInTheDocument();
    expect(close.className).toContain("size-9");
  });

  it("content uses the Marker shell", () => {
    const cls = read("dialog-content.svelte");
    for (const c of [
      "bg-popover",
      "rounded-xl",
      "ring-hairline",
      "shadow-xl",
      "p-6",
      "zoom-in-95",
      "ease-out",
      "ease-in",
      "max-w-[calc(100%-2rem)]",
    ])
      expect(cls).toContain(c);
  });

  it("overlay is ink at 40% in both modes", () => {
    const cls = read("dialog-overlay.svelte");
    expect(cls).toContain(
      "bg-[color-mix(in_srgb,var(--color-inverse)_40%,transparent)]",
    );
    expect(cls).toContain("fade-in-0");
  });
});

describe("Command shell", () => {
  it("input is at least 44px and has no dead class", () => {
    const cls = read("../command/command-input.svelte");
    expect(cls).toContain("h-11!");
    expect(cls).not.toContain("h-8!");
    expect(cls).not.toContain("border-input/30");
  });

  it("items are at least 44px", () => {
    expect(read("../command/command-item.svelte")).toContain("min-h-11");
  });
});
