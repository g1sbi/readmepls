import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { page } from "$app/stores";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown, extra: Record<string, unknown> = {}) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
  ...extra,
});

const ready = () => article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] });

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

// Default to pro so tag/action assertions are unaffected by tiering.
beforeEach(() => page.set({ ...basePageValue, data: { tier: "pro" } }));

describe("ArticleCard", () => {
  it("links the whole card to the reader when ready", () => {
    render(ArticleCard, { article: ready() });
    const link = screen.getByRole("link", { name: /hello/i });
    expect(link).toHaveAttribute("href", "/read/a1");
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /read/i })).not.toBeInTheDocument();
  });

  it("shows a processing indicator when not yet extracted", () => {
    render(ArticleCard, { article: article(null) });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the reason and a retry button when failed", async () => {
    const onRetry = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "failed", title: "X", failure_reason: "boom" }),
      onRetry,
    });
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("a1");
  });

  it("renders no actions menu when no handlers are provided", () => {
    render(ArticleCard, { article: ready() });
    expect(screen.queryByRole("button", { name: "article actions" })).not.toBeInTheDocument();
  });

  it("adds the article to a collection from the menu", async () => {
    const onAddToCollection = vi.fn();
    render(ArticleCard, {
      article: ready(),
      collections: [{ id: "c1", name: "read later" }],
      onAddToCollection,
    });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /read later/i })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("menuitem", { name: /read later/i }));
    expect(onAddToCollection).toHaveBeenCalledWith("a1", "c1");
  });

  it("shows an empty hint when there are no collections", async () => {
    render(ArticleCard, { article: ready(), collections: [], onAddToCollection: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await waitFor(() => expect(screen.getByText(/no collections yet/i)).toBeInTheDocument());
  });

  it("archives an unarchived article from the menu", async () => {
    const onArchive = vi.fn();
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { status: "unread" }), onArchive });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /^archive$/i }));
    expect(onArchive).toHaveBeenCalledWith("a1");
  });

  it("offers unarchive for an archived article", async () => {
    const onUnarchive = vi.fn();
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { status: "archived" }), onUnarchive });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /unarchive/i }));
    expect(onUnarchive).toHaveBeenCalledWith("a1");
  });

  it("deletes via the menu after confirming", async () => {
    const onDelete = vi.fn();
    render(ArticleCard, { article: ready(), onDelete });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await waitFor(() => expect(screen.getByText(/can't be undone/i)).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("shows the hostname (not the full path) while processing", () => {
    render(ArticleCard, {
      article: { id: "a2", url: "https://example.com/some/very/long/path?x=1", expand: undefined },
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText(/some\/very\/long\/path/)).not.toBeInTheDocument();
  });

  it("hides AI tags for a standard-tier viewer even when content has them", () => {
    page.set({ ...basePageValue, data: { tier: "standard" } });
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }) });
    expect(screen.queryByText("ai")).not.toBeInTheDocument();
    expect(screen.queryByText("ml")).not.toBeInTheDocument();
  });

  it("shows AI tags for a pro-tier viewer", () => {
    page.set({ ...basePageValue, data: { tier: "pro" } });
    render(ArticleCard, { article: ready() });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });
});
