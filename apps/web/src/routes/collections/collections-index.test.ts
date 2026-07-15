import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Collections from "./+page.svelte";

describe("collections index", () => {
  it("renders a folder per collection with counts", () => {
    render(Collections, {
      data: {
        collections: [
          { id: "c1", name: "recipes", slug: "recipes", count: 12 },
          { id: "c2", name: "work", slug: "work", count: 0 },
        ],
      },
    });
    expect(screen.getByRole("link", { name: /recipes/i })).toHaveAttribute(
      "href",
      "/collections/recipes",
    );
    expect(screen.getByRole("link", { name: /work/i })).toHaveAttribute(
      "href",
      "/collections/work",
    );
  });

  it("shows an empty state when there are no collections", () => {
    render(Collections, { data: { collections: [] } });
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
  });
});
