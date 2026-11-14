import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import ReaderActionsMenu from "./ReaderActionsMenu.svelte";

const collections = [
  { id: "c1", name: "Recipes", slug: "recipes", count: 12 },
  { id: "c2", name: "Physics", slug: "physics", count: 3 },
];

const props = (over: Record<string, unknown> = {}) => ({
  collections,
  originalUrl: "https://example.com/p",
  onAddToCollection: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

const text = (el: Element) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim();

async function open() {
  await fireEvent.click(
    screen.getByRole("button", { name: "Article actions" }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0),
  );
}

describe("ReaderActionsMenu", () => {
  it("lists the collections, then open original, archive and delete", async () => {
    render(ReaderActionsMenu, props());
    await open();
    expect(screen.getAllByRole("menuitem").map(text)).toEqual([
      "Recipes 12",
      "Physics 3",
      "Open original",
      "Archive",
      "Delete",
    ]);
    expect(screen.getByText("Add to collection")).toBeInTheDocument();
  });

  it("adds the article to the collection that was picked", async () => {
    const onAddToCollection = vi.fn();
    render(ReaderActionsMenu, props({ onAddToCollection }));
    await open();
    await fireEvent.click(screen.getByRole("menuitem", { name: /Physics/ }));
    expect(onAddToCollection).toHaveBeenCalledWith("c2");
  });

  it("archives and deletes from their rows", async () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    render(ReaderActionsMenu, props({ onArchive, onDelete }));
    await open();
    await fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalled();
    await open();
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("says so when there are no collections yet", async () => {
    render(ReaderActionsMenu, props({ collections: [] }));
    await open();
    expect(screen.getByText("No collections yet")).toBeInTheDocument();
  });

  it("drops open original when the article has no usable url", async () => {
    render(ReaderActionsMenu, props({ originalUrl: null }));
    await open();
    expect(
      screen.queryByRole("menuitem", { name: "Open original" }),
    ).toBeNull();
  });
});
