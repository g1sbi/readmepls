import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { Highlight } from "@readmepls/types";
import HighlightsPanel from "./HighlightsPanel.svelte";

const hl = (id: string): Highlight => ({
  id,
  user: "u1",
  article: "a1",
  text: `passage ${id}`,
  prefix: "",
  suffix: "",
  startOffset: 0,
  endOffset: 10,
  color: "terracotta",
  note: "",
  created: "2026-11-02 10:00:00.000Z",
});

const mount = (over: Record<string, unknown> = {}) => {
  const onClose = vi.fn();
  const r = render(HighlightsPanel, {
    open: true,
    onClose,
    highlights: [hl("h1"), hl("h2"), hl("h3")],
    orphans: ["h3"],
    onjump: vi.fn(),
    ondelete: vi.fn(),
    ...over,
  } as never);
  return { onClose, ...r };
};

describe("HighlightsPanel", () => {
  it("counts the highlights in its title, orphans included", async () => {
    mount();
    expect(await screen.findByText("Highlights")).toBeInTheDocument();
    expect(screen.getByTestId("highlights-count")).toHaveTextContent("3");
  });

  it("lists every highlight", async () => {
    mount();
    expect(await screen.findByText("passage h1")).toBeInTheDocument();
    expect(screen.getByText("passage h3")).toBeInTheDocument();
  });

  it("stays shut until it is opened", () => {
    mount({ open: false });
    expect(screen.queryByText("passage h1")).toBeNull();
  });

  it("closes on Escape", async () => {
    const { onClose } = mount();
    await screen.findByText("passage h1");
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
