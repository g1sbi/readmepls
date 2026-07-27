import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ChaptersSidebar from "./ChaptersSidebar.svelte";
import type { TocEntry } from "@readmepls/types";

const toc: TocEntry[] = [
  {
    id: "intro",
    text: "intro",
    level: 2,
    children: [{ id: "why", text: "why", level: 3, children: [] }],
  },
  { id: "usage", text: "usage", level: 2, children: [] },
];

describe("ChaptersSidebar", () => {
  it("renders top-level chapters and nested subchapters", () => {
    render(ChaptersSidebar, { toc, activeId: null, onjump: vi.fn() });
    expect(screen.getByRole("navigation", { name: "chapters" })).toBeTruthy();
    expect(screen.getByText("intro")).toBeTruthy();
    expect(screen.getByText("usage")).toBeTruthy();
    // subchapter visible because groups are expanded by default
    expect(screen.getByText("why")).toBeTruthy();
  });

  it("emits the heading id on click", async () => {
    const onjump = vi.fn();
    render(ChaptersSidebar, { toc, activeId: null, onjump });
    await fireEvent.click(screen.getByText("usage"));
    expect(onjump).toHaveBeenCalledWith("usage");
  });

  it("marks the active chapter", () => {
    render(ChaptersSidebar, { toc, activeId: "usage", onjump: vi.fn() });
    expect(screen.getByText("usage").getAttribute("aria-current")).toBe("true");
  });
});
