import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { TocEntry } from "@readmepls/types";
import ChapterList from "./ChapterList.svelte";

const items: TocEntry[] = [
  {
    id: "flow",
    text: "Flow",
    level: 2,
    children: [{ id: "laminar", text: "Laminar", level: 3, children: [] }],
  },
  { id: "notes", text: "Notes", level: 2, children: [] },
];

const mount = (over: Record<string, unknown> = {}) => {
  const onjump = vi.fn();
  const r = render(ChapterList, {
    items,
    activeId: null,
    onjump,
    ...over,
  } as never);
  return { onjump, ...r };
};

describe("ChapterList", () => {
  it("lists every chapter as one flat row, keeping its depth", () => {
    mount();
    const rows = screen.getAllByRole("button");
    expect(rows.map((r) => r.textContent?.trim())).toEqual([
      "Flow",
      "Laminar",
      "Notes",
    ]);
    expect(rows[0]).toHaveAttribute("data-depth", "0");
    expect(rows[1]).toHaveAttribute("data-depth", "1");
  });

  it("marks the chapter being read", () => {
    mount({ activeId: "laminar" });
    expect(screen.getByRole("button", { name: "Laminar" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("jumps to the chapter that was tapped", async () => {
    const { onjump } = mount();
    await fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(onjump).toHaveBeenCalledWith("notes");
  });

  it("offers no collapsing toggles", () => {
    mount();
    expect(screen.queryByLabelText(/subchapters/i)).toBeNull();
  });
});
