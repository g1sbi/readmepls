import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import CollectionsPanel from "./CollectionsPanel.svelte";

const cols = [{ id: "c1", name: "reading list", slug: "reading-list" }];

describe("CollectionsPanel", () => {
  it("renders each collection as a row linking to its page", () => {
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename: vi.fn(), ondelete: vi.fn() });
    const link = screen.getByRole("link", { name: /reading list/i });
    expect(link).toHaveAttribute("href", "/collections/reading-list");
  });

  it("creates a collection through the expanding input", async () => {
    const oncreate = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate, onrename: vi.fn(), ondelete: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.input(input, { target: { value: "later reads" } });
    await fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(oncreate).toHaveBeenCalledWith("later reads");
  });

  it("renames a collection", async () => {
    const onrename = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename, ondelete: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /rename reading list/i }));
    const input = screen.getByLabelText(/rename collection/i);
    await fireEvent.input(input, { target: { value: "to read" } });
    await fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onrename).toHaveBeenCalledWith("c1", "to read");
  });

  it("deletes a collection", async () => {
    const ondelete = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename: vi.fn(), ondelete });
    await fireEvent.click(screen.getByRole("button", { name: /delete reading list/i }));
    expect(ondelete).toHaveBeenCalledWith("c1");
  });

  it("shows a duplicate-name error", () => {
    render(CollectionsPanel, { collections: cols, error: "a collection with that name already exists", oncreate: vi.fn(), onrename: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
