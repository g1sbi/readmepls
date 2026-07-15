import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/svelte";
import { page } from "$app/stores";
import { LibraryParams } from "@readmepls/types";

const { del, collectionCreate, invalidateAll, goto } = vi.hoisted(() => ({
  del: vi.fn().mockResolvedValue(undefined),
  collectionCreate: vi.fn().mockResolvedValue(undefined),
  invalidateAll: vi.fn(),
  goto: vi.fn(),
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" } },
    filter: (s: string) => s,
    collection: (name: string) => ({
      subscribe: vi.fn().mockResolvedValue(() => {}),
      update: vi.fn(),
      create: name === "collections" ? collectionCreate : vi.fn(),
      delete: vi.fn(),
      getFirstListItem: vi.fn(),
    }),
  }),
}));
vi.mock("$lib/article/delete.js", () => ({ deleteArticle: (_pb: unknown, id: string) => del(id) }));
vi.mock("$app/navigation", () => ({ goto, invalidateAll }));

import Library from "./+page.svelte";

const article = { id: "a1", url: "https://example.com/p", status: "unread", progress: 0,
  expand: { content: { extract_status: "ok", title: "Hello", ai_tags_json: [] } } };
const data = {
  params: LibraryParams.parse({}),
  page: { items: [article], totalItems: 1, page: 1, perPage: 24 },
  facets: {
    tags: [],
    collections: [{ id: "c1", name: "reading list", slug: "reading-list", count: 3 }],
    options: { sources: [], languages: [], authors: [] },
  },
};
const basePageValue = {
  params: {}, url: new URL("http://localhost/library"), route: { id: null },
  status: 200, error: null, data: { tier: "pro" }, form: null, state: {},
};
beforeEach(() => {
  page.set(basePageValue as never);
  invalidateAll.mockClear();
  collectionCreate.mockClear();
  goto.mockClear();
});

async function deleteViaMenu() {
  await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
  await fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
  await fireEvent.click(screen.getByRole("button", { name: "delete" }));
}

describe("library page", () => {
  it("renders articles from the load data", () => {
    render(Library, { data } as never);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("deletes an article via PocketBase when confirmed", async () => {
    render(Library, { data } as never);
    await deleteViaMenu();
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });

  it("shows an error and keeps the article when delete fails", async () => {
    del.mockRejectedValueOnce(new Error("forbidden"));
    render(Library, { data } as never);
    await deleteViaMenu();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't delete that. try again."));
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("manages collections from within the filter drawer", async () => {
    render(Library, { data } as never);
    await fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    // The collections filter fieldset and the CollectionsPanel management section
    // both render inside the drawer — this is the CollectionsPanel management row.
    // Scoped to the dialog since the library page's folder strip (above the
    // toolbar) also renders a "reading list" link outside the drawer.
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByRole("link", { name: /reading list/i })).toHaveAttribute("href", "/collections/reading-list");

    await fireEvent.click(drawer.getByRole("button", { name: /new collection/i }));
    const input = drawer.getByLabelText(/new collection name/i);
    await fireEvent.input(input, { target: { value: "later reads" } });
    await fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(collectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ user: "u1", name: "later reads", slug: "later-reads" }),
    ));
    await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  });

  it("hides the pager when everything fits on one page", () => {
    render(Library, { data } as never);
    expect(screen.queryByRole("navigation", { name: "library pagination" })).not.toBeInTheDocument();
  });

  it("renders the pager and advances to the next page", async () => {
    const multiPageData = { ...data, page: { items: [article], totalItems: 48, page: 1, perPage: 24 } };
    render(Library, { data: multiPageData } as never);
    expect(screen.getByText("page 1 of 2")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "next →" }));
    expect(goto).toHaveBeenCalledWith("/library?page=2", expect.anything());
  });

  it("renders a folder strip linking to each collection", () => {
    render(Library, { data } as never);
    const link = screen.getByRole("link", { name: /reading list/i });
    expect(link).toHaveAttribute("href", "/collections/reading-list");
  });

  it("hides the strip when there are no collections", () => {
    render(Library, { data: { ...data, facets: { ...data.facets, collections: [] } } } as never);
    expect(screen.queryByRole("link", { name: /reading list/i })).toBeNull();
  });
});
