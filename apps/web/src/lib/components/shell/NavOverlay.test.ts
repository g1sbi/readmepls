import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const { media } = vi.hoisted(() => ({ media: { wide: false } }));
vi.mock("svelte/reactivity", async (orig) => ({
  ...(await orig<typeof import("svelte/reactivity")>()),
  MediaQuery: class {
    get current() {
      return media.wide;
    }
  },
}));
vi.mock("$lib/collections/actions.js", () => ({
  createCollection: vi.fn(),
}));
vi.mock("$lib/pb.js", () => ({ browserPb: () => ({}) }));

import NavOverlay from "./NavOverlay.svelte";

const collections = [{ id: "c1", name: "Physics", slug: "physics", count: 4 }];

const mount = (over: Record<string, unknown> = {}) => {
  const onClose = vi.fn();
  render(NavOverlay, {
    open: true,
    onClose,
    pathname: "/read/a1",
    collections,
    ...over,
  } as never);
  return { onClose };
};

beforeEach(() => {
  media.wide = false;
  // jsdom can't navigate; keep link clicks from logging "not implemented".
  document.addEventListener("click", (e) => e.preventDefault());
});

describe("NavOverlay", () => {
  it("renders the full sidebar in a left sheet when wide", async () => {
    media.wide = true;
    mount();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const sheet = nav.closest("[data-slot='sheet-content']");
    expect(sheet).not.toBeNull();
    expect(sheet).toHaveAttribute("data-side", "left");
    expect(screen.getByRole("link", { name: /Physics/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders the More sheet with Home and Library on top when narrow", async () => {
    mount();
    expect(await screen.findByText("More")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    const home = screen.getByRole("link", { name: "Home" });
    const library = screen.getByRole("link", { name: "Library" });
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(home).toHaveAttribute("href", "/");
    expect(library).toHaveAttribute("href", "/library");
    expect(
      home.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Reading an article sits under Library.
    expect(library).toHaveAttribute("aria-current", "page");
  });

  it("closes when a link is followed (narrow)", async () => {
    const { onClose } = mount();
    await fireEvent.click(await screen.findByRole("link", { name: "Home" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when a link is followed (wide)", async () => {
    media.wide = true;
    const { onClose } = mount();
    await fireEvent.click(await screen.findByRole("link", { name: /Physics/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("renders nothing while closed", () => {
    media.wide = true;
    mount({ open: false });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
