import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BottomSheet from "./BottomSheet.svelte";

const read = (f: string) =>
  readFileSync(resolve(import.meta.dirname, f), "utf8");

describe("BottomSheet", () => {
  it("does not render its header when closed", () => {
    render(BottomSheet, { open: false, onClose: () => {}, title: "text" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("renders the title when open", async () => {
    render(BottomSheet, { open: true, onClose: () => {}, title: "chapters" });
    expect(await screen.findByText("chapters")).toBeTruthy();
  });

  it("fires onClose from the close button", async () => {
    const onClose = vi.fn();
    render(BottomSheet, { open: true, onClose, title: "text" });
    await fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("drawer content is a Marker sheet with a grab handle and safe area", () => {
    const cls = read("drawer/drawer-content.svelte");
    for (const c of [
      "rounded-t-xl",
      "bg-background",
      "h-1.5",
      "w-10",
      "bg-secondary",
      "env(safe-area-inset-bottom)",
    ])
      expect(cls).toContain(c);
  });

  it("drawer content is outlined by its hairline ring only, no edge border", () => {
    const cls = read("drawer/drawer-content.svelte");
    expect(cls).toContain("ring-hairline");
    expect(cls).not.toMatch(/:border-[tblr]\b/);
  });
});
