import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import LibraryCollections from "./LibraryCollections.svelte";

const cols = [
  { id: "c1", name: "recipes", slug: "recipes", count: 12 },
  { id: "c2", name: "work", slug: "work", count: 0 },
];

describe("LibraryCollections", () => {
  it("always renders the collections heading, even when empty", () => {
    render(LibraryCollections, { collections: [], onCreate: vi.fn() });
    expect(screen.getByRole("heading", { name: /collections/i })).toBeInTheDocument();
  });

  it("renders a folder tile per collection linking to its page with count", () => {
    render(LibraryCollections, { collections: cols, onCreate: vi.fn() });
    expect(screen.getByRole("link", { name: /recipes/i })).toHaveAttribute("href", "/collections/recipes");
    expect(screen.getByRole("link", { name: /work/i })).toHaveAttribute("href", "/collections/work");
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("reveals the input and creates a collection with a trimmed name", async () => {
    const onCreate = vi.fn();
    render(LibraryCollections, { collections: cols, onCreate });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.input(input, { target: { value: "  travel  " } });
    await fireEvent.submit(input.closest("form")!);
    expect(onCreate).toHaveBeenCalledWith("travel");
  });

  it("does not create on a blank name", async () => {
    const onCreate = vi.fn();
    render(LibraryCollections, { collections: cols, onCreate });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.submit(input.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows an empty-state hint and no tile links with no collections", () => {
    render(LibraryCollections, { collections: [], onCreate: vi.fn() });
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("surfaces a create error", () => {
    render(LibraryCollections, {
      collections: cols,
      error: "a collection with that name already exists",
      onCreate: vi.fn(),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
