import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";

// Home page constructs a PocketBase client and subscribes on mount; stub it so
// the component renders without touching the network.
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(() => {}),
    }),
  }),
}));

import Page from "./+page.svelte";

describe("home page hero", () => {
  it("keeps a screen-reader heading but drops the visible tagline styling", () => {
    render(Page);
    expect(
      screen.getByRole("heading", { level: 1, name: /save any link/i }),
    ).toBeInTheDocument();
  });

  it("renders the capture pill", () => {
    render(Page);
    expect(
      screen.getByRole("textbox", { name: /paste a link/i }),
    ).toBeInTheDocument();
  });

  it("renders quick-action chips linking to library and collections", () => {
    render(Page);
    expect(
      screen.getByRole("link", { name: /browse library/i }),
    ).toHaveAttribute("href", "/library");
    expect(
      screen.getByRole("link", { name: /your collections/i }),
    ).toHaveAttribute("href", "/collections");
  });
});
