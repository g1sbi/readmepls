import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { page as pageStore } from "$app/stores";
import type { Writable } from "svelte/store";

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    filter: (q: string) => q,
    collection: (name: string) =>
      name === "collections"
        ? {
            getFirstListItem: vi.fn(async () => ({
              id: "c1",
              name: "Rust reads",
            })),
          }
        : { getFullList: vi.fn(async () => []) },
  }),
}));

import Page from "./+page.svelte";

// The vitest alias swaps in a writable stub (src/__mocks__/app-stores.ts).
const page = pageStore as unknown as Writable<{
  params: Record<string, string>;
}>;

describe("collection page", () => {
  it("titles the page with the collection's name in the page header", async () => {
    page.update((p) => ({ ...p, params: { slug: "rust" } }));
    render(Page);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Rust reads" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save a link" }),
    ).toBeInTheDocument();
  });
});
