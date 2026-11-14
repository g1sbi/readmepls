import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { Highlight } from "@readmepls/types";
import HighlightMap from "./HighlightMap.svelte";

const hl = (over: Partial<Highlight>): Highlight => ({
  id: "h1",
  user: "u1",
  article: "a1",
  text: "Turbulence remains unsolved",
  prefix: "",
  suffix: "",
  startOffset: 0,
  endOffset: 10,
  color: "terracotta",
  note: "",
  created: "2026-11-02 10:00:00.000Z",
  ...over,
});

const highlights = [
  hl({ id: "h1" }),
  hl({ id: "h2", color: "sage", note: "check this against the paper" }),
  hl({ id: "h3", text: "lost passage" }),
];

const mount = (over: Record<string, unknown> = {}) => {
  const onjump = vi.fn();
  const r = render(HighlightMap, {
    highlights,
    // h3 no longer anchors, so the map has no position for it.
    positions: [
      { id: "h1", at: 0.2 },
      { id: "h2", at: 0.6 },
    ],
    viewport: { at: 0.1, size: 0.3 },
    onjump,
    ...over,
  } as never);
  return { onjump, ...r };
};

const ticks = () => screen.getAllByRole("button");

describe("HighlightMap", () => {
  // Review Focus 4: an orphan has no position, so it never reaches the map.
  it("draws a tick only for the highlights it can place", () => {
    mount();
    expect(ticks()).toHaveLength(2);
    expect(screen.queryByLabelText(/lost passage/)).toBeNull();
  });

  it("places each tick at its share of the article", () => {
    mount();
    expect(ticks()[0]!.style.top).toBe("20%");
    expect(ticks()[1]!.style.top).toBe("60%");
  });

  it("dots the highlights that carry a note", () => {
    mount();
    expect(ticks()[0]!).toHaveAttribute("data-has-note", "false");
    expect(ticks()[1]!).toHaveAttribute("data-has-note", "true");
  });

  it("shows the passage, the note and its color on focus", async () => {
    mount();
    await fireEvent.focus(ticks()[1]!);
    const card = screen.getByRole("dialog");
    expect(card).toHaveTextContent("Turbulence remains unsolved");
    expect(card).toHaveTextContent("check this against the paper");
    expect(card).toHaveTextContent("Mint");
    expect(card).toHaveTextContent("Click to jump");
  });

  it("jumps to the highlight on Enter", async () => {
    const { onjump } = mount();
    await fireEvent.keyDown(ticks()[1]!, { key: "Enter" });
    expect(onjump).toHaveBeenCalledWith("h2");
  });

  it("sizes the viewport bar to the part of the article on screen", () => {
    const { container } = mount();
    const bar = container.querySelector(".viewport") as HTMLElement;
    expect(bar.style.top).toBe("10%");
    expect(bar.style.height).toBe("30%");
  });

  it("marks a just-saved highlight so its tick draws itself in", () => {
    mount({ newId: "h2" });
    expect(ticks()[0]!).not.toHaveAttribute("data-new");
    expect(ticks()[1]!).toHaveAttribute("data-new", "true");
  });

  it("has nothing to draw without highlights", () => {
    const { container } = mount({ highlights: [], positions: [] });
    expect(container.textContent).toBe("");
  });
});
