import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderMoreSheet from "./ReaderMoreSheet.svelte";

const collections = [
  { id: "c1", name: "Recipes", slug: "recipes", count: 12 },
  { id: "c2", name: "Physics", slug: "physics", count: 3 },
];

const text = (el: Element) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim();

const props = (over: Record<string, unknown> = {}) => ({
  collections,
  originalUrl: "https://example.com/p",
  tags: [{ id: "t1", name: "optics" }],
  onAddTag: vi.fn(),
  onRemoveTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  open: true,
  onClose: vi.fn(),
  ...over,
});

describe("ReaderMoreSheet", () => {
  it("is titled More and leads with the tags", async () => {
    render(ReaderMoreSheet, props());
    expect(await screen.findByText("More")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("optics")).toBeInTheDocument();
  });

  it("keeps the menu's order: collections, open original, archive, delete", async () => {
    render(ReaderMoreSheet, props());
    const rows = await screen.findAllByTestId("more-row");
    expect(rows.map(text)).toEqual([
      "Recipes 12",
      "Physics 3",
      "Open original",
      "Archive",
      "Delete",
    ]);
  });

  it("adds the article to the collection that was tapped", async () => {
    const onAddToCollection = vi.fn();
    render(ReaderMoreSheet, props({ onAddToCollection }));
    await fireEvent.click(
      await screen.findByRole("button", { name: /Physics/ }),
    );
    expect(onAddToCollection).toHaveBeenCalledWith("c2");
  });

  it("removes a tag", async () => {
    const onRemoveTag = vi.fn();
    render(ReaderMoreSheet, props({ onRemoveTag }));
    await fireEvent.click(
      await screen.findByRole("button", { name: /remove optics/i }),
    );
    expect(onRemoveTag).toHaveBeenCalledWith("t1");
  });

  it("drops open original when the article has no usable url", async () => {
    render(ReaderMoreSheet, props({ originalUrl: null }));
    const rows = await screen.findAllByTestId("more-row");
    expect(rows.map(text)).not.toContain("Open original");
  });
});
