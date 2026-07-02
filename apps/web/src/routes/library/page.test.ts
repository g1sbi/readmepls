import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { page } from "$app/stores";

const del = vi.fn().mockResolvedValue(undefined);
const article = {
  id: "a1", url: "https://example.com/p", status: "unread", progress: 0,
  expand: { content: { extract_status: "ok", title: "Hello", ai_tags_json: [] } },
};

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" } },
    filter: (s: string) => s,
    collection: (name: string) => ({
      getList: vi.fn().mockResolvedValue({ items: name === "articles" ? [article] : [] }),
      getFullList: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(() => {}),
      delete: del,
    }),
  }),
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import Library from "./+page.svelte";

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

// The article card reads $page.data.tier; seed it so tag-gating derives cleanly.
beforeEach(() => page.set({ ...basePageValue, data: { tier: "pro" } }));

// Delete now lives behind the card's ⋯ actions menu, then a confirm dialog.
async function deleteViaMenu() {
  await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
  await fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
  await fireEvent.click(screen.getByRole("button", { name: "delete" }));
}

describe("library page", () => {
  it("deletes an article via PocketBase when confirmed", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    await deleteViaMenu();
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });

  it("shows an error and keeps the article when delete fails", async () => {
    del.mockRejectedValueOnce(new Error("forbidden"));
    render(Library);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    await deleteViaMenu();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("couldn't delete that. try again.")
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
