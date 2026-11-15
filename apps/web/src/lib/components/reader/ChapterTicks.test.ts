import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { TocEntry } from "@readmepls/types";
import ChapterTicks from "./ChapterTicks.svelte";

const toc: TocEntry[] = [
  {
    id: "flow",
    text: "Flow",
    level: 2,
    children: [
      { id: "laminar", text: "Laminar", level: 3, children: [] },
      { id: "turbulent", text: "Turbulent", level: 3, children: [] },
    ],
  },
  { id: "notes", text: "Notes", level: 2, children: [] },
];

const mount = (over: Record<string, unknown> = {}) => {
  const onjump = vi.fn();
  const r = render(ChapterTicks, {
    toc,
    activeId: null,
    onjump,
    ...over,
  } as never);
  return { onjump, ...r };
};

const column = () => screen.getByRole("navigation", { name: "Chapters" });
const rows = () => screen.getAllByRole("button");

afterEach(() => {
  vi.useRealTimers();
});

describe("ChapterTicks", () => {
  // Review Focus 1: an article without headings gets no chapter column.
  it("renders nothing without a toc", () => {
    const { container } = mount({ toc: [] });
    expect(container.textContent).toBe("");
  });

  it("gets out of the way while the highlights panel is open", () => {
    mount({ hidden: true });
    expect(column().closest(".ticks")).toHaveAttribute("data-hidden", "true");
  });

  it("gives every chapter, nested ones included, a row of its own", () => {
    mount();
    expect(rows().map((b) => b.textContent?.trim())).toEqual([
      "Flow",
      "Laminar",
      "Turbulent",
      "Notes",
    ]);
  });

  it("marks the chapter being read", () => {
    mount({ activeId: "turbulent" });
    expect(screen.getByRole("button", { name: "Turbulent" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getByRole("button", { name: "Flow" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("expands as soon as a tick takes focus", async () => {
    mount();
    expect(column()).toHaveAttribute("data-expanded", "false");
    await fireEvent.focusIn(rows()[0]!);
    expect(column()).toHaveAttribute("data-expanded", "true");
  });

  it("waits out a passing pointer before expanding", async () => {
    vi.useFakeTimers();
    mount();
    await fireEvent.pointerEnter(column());
    await vi.advanceTimersByTimeAsync(50);
    expect(column()).toHaveAttribute("data-expanded", "false");
    await vi.advanceTimersByTimeAsync(70);
    expect(column()).toHaveAttribute("data-expanded", "true");
  });

  it("collapses a beat after the pointer leaves", async () => {
    vi.useFakeTimers();
    mount();
    await fireEvent.pointerEnter(column());
    await vi.advanceTimersByTimeAsync(120);
    expect(column()).toHaveAttribute("data-expanded", "true");
    await fireEvent.pointerLeave(column());
    await vi.advanceTimersByTimeAsync(100);
    expect(column()).toHaveAttribute("data-expanded", "true");
    await vi.advanceTimersByTimeAsync(150);
    expect(column()).toHaveAttribute("data-expanded", "false");
  });

  it("walks the rows with the arrow keys", async () => {
    mount();
    rows()[0]!.focus();
    await fireEvent.keyDown(rows()[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows()[1]);
    await fireEvent.keyDown(rows()[1]!, { key: "End" });
    expect(document.activeElement).toBe(rows()[3]);
    await fireEvent.keyDown(rows()[3]!, { key: "Home" });
    expect(document.activeElement).toBe(rows()[0]);
    await fireEvent.keyDown(rows()[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows()[0]);
  });

  it("jumps to the chapter on Enter", async () => {
    const { onjump } = mount();
    rows()[2]!.focus();
    await fireEvent.keyDown(rows()[2]!, { key: "Enter" });
    expect(onjump).toHaveBeenCalledWith("turbulent");
  });

  it("collapses on Escape", async () => {
    mount();
    await fireEvent.focusIn(rows()[0]!);
    expect(column()).toHaveAttribute("data-expanded", "true");
    await fireEvent.keyDown(rows()[0]!, { key: "Escape" });
    expect(column()).toHaveAttribute("data-expanded", "false");
  });
});
