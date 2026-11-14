import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ArticleMeta from "./ArticleMeta.svelte";

const props = (over: Record<string, unknown> = {}) => ({
  source: { host: "en.wikipedia.org", name: "Wikipedia", iconUrl: null },
  originalUrl: "https://en.wikipedia.org/wiki/Navier",
  readTime: 12,
  created: "2026-11-02 10:00:00.000Z",
  tags: [{ id: "t1", name: "optics" }],
  onAddTag: vi.fn(),
  onRemoveTag: vi.fn(),
  ...over,
});

describe("ArticleMeta", () => {
  it("names the source, the reading time and the saved date", () => {
    render(ArticleMeta, props());
    expect(screen.getByText("Wikipedia")).toBeInTheDocument();
    expect(screen.getByText("12 min read")).toBeInTheDocument();
    expect(screen.getByText(/^Saved Nov 2/)).toBeInTheDocument();
  });

  it("omits the reading time when the content has none", () => {
    render(ArticleMeta, props({ readTime: null }));
    expect(screen.queryByText(/min read/)).toBeNull();
    expect(screen.getByText(/^Saved Nov 2/)).toBeInTheDocument();
  });

  it("links to the original in a new tab", () => {
    render(ArticleMeta, props());
    const link = screen.getByRole("link", { name: /Open original/ });
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Navier",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("drops the original link when there is no usable url", () => {
    render(ArticleMeta, props({ originalUrl: null }));
    expect(screen.queryByRole("link", { name: /Open original/ })).toBeNull();
  });

  it("edits the manual tags", async () => {
    const onRemoveTag = vi.fn();
    render(ArticleMeta, props({ onRemoveTag }));
    await fireEvent.click(
      screen.getByRole("button", { name: /remove optics/i }),
    );
    expect(onRemoveTag).toHaveBeenCalledWith("t1");
  });
});
