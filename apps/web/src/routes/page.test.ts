import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";

// Home page constructs a PocketBase client and subscribes on mount; stub it so
// the component renders without touching the network.
const { getList } = vi.hoisted(() => ({ getList: vi.fn() }));
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      getList,
      subscribe: vi.fn().mockResolvedValue(() => {}),
    }),
  }),
}));

import { captureSaved } from "$lib/capture/saved.svelte.js";
import Page from "./+page.svelte";

describe("home page hero", () => {
  // PageHeader's capture sheet reads a MediaQuery, which needs matchMedia.
  beforeEach(() => {
    getList.mockReset().mockResolvedValue({ items: [] });
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

  it("places the greeting above the capture field", () => {
    const { container } = render(Page);
    const greeting = container.querySelector(".greeting");
    const field = screen.getByRole("textbox", { name: "Save a link" });
    expect(greeting).not.toBeNull();
    expect(
      greeting!.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it("refetches the list after a link is saved", async () => {
    render(Page);
    await waitFor(() => expect(getList).toHaveBeenCalledTimes(1));
    captureSaved.notify();
    await waitFor(() => expect(getList).toHaveBeenCalledTimes(2));
  });

  it("keeps the newest result when two loads resolve out of order", async () => {
    const card = (id: string, title: string) => ({
      id,
      url: `https://example.com/${id}`,
      status: "unread",
      expand: {
        content: { id: `c-${id}`, title, extract_status: "ok" },
      },
    });
    let resolveStale!: (v: unknown) => void;
    getList
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveStale = r;
        }),
      )
      .mockResolvedValueOnce({ items: [card("b", "fresh article")] });
    render(Page);
    await waitFor(() => expect(getList).toHaveBeenCalledTimes(1));
    captureSaved.notify();
    expect(await screen.findByText("fresh article")).toBeInTheDocument();
    // The first (older) request lands last; it must not clobber the list.
    resolveStale({ items: [card("a", "stale article")] });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("stale article")).toBeNull();
    expect(screen.getByText("fresh article")).toBeInTheDocument();
  });

  it("logs a failed refetch instead of leaving it unhandled", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(Page);
    await waitFor(() => expect(getList).toHaveBeenCalledTimes(1));
    const boom = new Error("offline");
    getList.mockRejectedValueOnce(boom);
    captureSaved.notify();
    await waitFor(() => expect(error).toHaveBeenCalledWith(boom));
    error.mockRestore();
  });
});
