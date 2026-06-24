import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import AddToCollection from "./AddToCollection.svelte";

describe("AddToCollection", () => {
  it("adds to an existing collection", async () => {
    const onadd = vi.fn();
    render(AddToCollection, { collections: [{ id: "c1", name: "Read Later" }], onadd, oncreate: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /read later/i }));
    expect(onadd).toHaveBeenCalledWith("c1");
  });

  it("creates a new collection", async () => {
    const oncreate = vi.fn();
    render(AddToCollection, { collections: [], onadd: vi.fn(), oncreate });
    const input = screen.getByLabelText(/new collection/i);
    await fireEvent.input(input, { target: { value: "Recipes" } });
    await fireEvent.submit(input.closest("form")!);
    expect(oncreate).toHaveBeenCalledWith("Recipes");
  });
});
