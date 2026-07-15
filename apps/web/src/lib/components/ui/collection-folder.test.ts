import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import CollectionFolder from "./CollectionFolder.svelte";

describe("CollectionFolder", () => {
  it("links to the collection page and shows name + count", () => {
    render(CollectionFolder, { name: "recipes", slug: "recipes", count: 12 });
    const link = screen.getByRole("link", { name: /recipes/i });
    expect(link).toHaveAttribute("href", "/collections/recipes");
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders a zero count", () => {
    render(CollectionFolder, { name: "empty", slug: "empty", count: 0 });
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
