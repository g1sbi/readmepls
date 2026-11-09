import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  // PageHeader's capture sheet reads a MediaQuery, which needs matchMedia.
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("titles the page Home and keeps a screen-reader tagline heading", () => {
    render(Page);
    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /save any link/i }),
    ).toBeInTheDocument();
  });

  it("renders the inline capture field and the header's capture button", () => {
    render(Page);
    expect(
      screen.getByRole("textbox", { name: "Save a link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save a link" }),
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
