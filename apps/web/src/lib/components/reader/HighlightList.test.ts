import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { Highlight } from "@readmepls/types";
import HighlightList from "./HighlightList.svelte";

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

const mount = (over: Record<string, unknown> = {}) => {
  const onjump = vi.fn();
  const ondelete = vi.fn();
  const r = render(HighlightList, {
    highlights: [
      hl({ id: "h1" }),
      hl({
        id: "h2",
        text: "Reynolds number",
        color: "sage",
        note: "against the paper",
      }),
      hl({ id: "h3", text: "lost passage" }),
    ],
    orphans: ["h3"],
    onjump,
    ondelete,
    ...over,
  } as never);
  return { onjump, ondelete, ...r };
};

describe("HighlightList", () => {
  it("bands each excerpt in its own color", () => {
    mount();
    const quote = screen.getByText("Turbulence remains unsolved");
    expect(quote.closest("li")).toHaveAttribute("data-color", "terracotta");
  });

  it("shows a note under its own icon", () => {
    mount();
    expect(screen.getByText("against the paper")).toBeInTheDocument();
  });

  it("warns about a highlight it can no longer find, and still deletes it", async () => {
    const { ondelete } = mount();
    const row = screen.getByText("lost passage").closest("li")!;
    expect(row).toHaveTextContent("Can't find this in the current text");
    await fireEvent.click(
      screen.getByRole("button", { name: "Delete highlight: lost passage" }),
    );
    expect(ondelete).toHaveBeenCalledWith("h3");
  });

  it("jumps to a highlight from its excerpt", async () => {
    const { onjump } = mount();
    await fireEvent.click(screen.getByText("Turbulence remains unsolved"));
    expect(onjump).toHaveBeenCalledWith("h1");
  });

  it("invites the first highlight when there are none", () => {
    mount({ highlights: [], orphans: [] });
    expect(screen.getByText(/Select any text to/)).toHaveTextContent(
      "Select any text to highlight it.",
    );
  });
});
