import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightsSidebar from "./HighlightsSidebar.svelte";
import type { Highlight } from "@readmepls/types";

const hls: Highlight[] = [
  { id: "h1", user: "u", article: "a", text: "anchored quote", prefix: "", suffix: "",
    startOffset: 0, endOffset: 14, color: "amber", note: "my note", created: "2026-06-24T00:00:00Z" },
  { id: "h2", user: "u", article: "a", text: "lost quote", prefix: "", suffix: "",
    startOffset: 0, endOffset: 10, color: "sage", note: "", created: "2026-06-24T00:00:00Z" },
];

describe("HighlightsSidebar", () => {
  it("lists highlights and their notes", () => {
    render(HighlightsSidebar, { highlights: hls, orphans: [], onjump: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByText("anchored quote")).toBeTruthy();
    expect(screen.getByText("my note")).toBeTruthy();
  });

  it("flags orphaned highlights as un-locatable", () => {
    render(HighlightsSidebar, { highlights: hls, orphans: ["h2"], onjump: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByText(/can.t locate/i)).toBeTruthy();
  });

  it("emits delete", async () => {
    const ondelete = vi.fn();
    render(HighlightsSidebar, { highlights: hls, orphans: [], onjump: vi.fn(), ondelete });
    await fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]!);
    expect(ondelete).toHaveBeenCalledWith("h1");
  });
});
