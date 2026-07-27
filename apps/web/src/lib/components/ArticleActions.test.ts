import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ArticleActions from "./ArticleActions.svelte";

const collections = [{ id: "c1", name: "recipes" }];

describe("ArticleActions", () => {
  it("fires onArchive and onDelete from their buttons", async () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    render(ArticleActions, { collections, onAddToCollection: vi.fn(), onArchive, onDelete });
    await fireEvent.click(screen.getByLabelText("archive article"));
    await fireEvent.click(screen.getByLabelText("delete article"));
    expect(onArchive).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it("renders the article actions group", () => {
    render(ArticleActions, { collections, onAddToCollection: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() });
    // The group wrapper is always present (unlike the dropdown popover, which
    // only mounts its "add to collection" label when opened).
    expect(screen.getByRole("group", { name: "article actions" })).toBeTruthy();
  });
});
