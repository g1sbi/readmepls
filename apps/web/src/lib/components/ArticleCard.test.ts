import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
});

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

// Most of these tests are about card states/actions unrelated to tiering —
// default to pro so their existing assertions (AI tags visible) don't change.
beforeEach(() => page.set({ ...basePageValue, data: { tier: "pro" } }));

describe("ArticleCard", () => {
  it("links the whole card to the reader when ready", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] }),
    });
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

  it("does not render a delete button without an onDelete handler", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
    });
    expect(screen.queryByRole("button", { name: "delete article" })).not.toBeInTheDocument();
  });

  it("opens a confirm dialog and fires onDelete when confirmed", async () => {
    const onDelete = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
      onDelete,
    });
    await fireEvent.click(screen.getByRole("button", { name: "delete article" }));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("shows the hostname (not the full path) while processing", () => {
    render(ArticleCard, {
      article: {
        id: "a2",
        url: "https://example.com/some/very/long/path?x=1",
        expand: undefined,
      },
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText(/some\/very\/long\/path/)).not.toBeInTheDocument();
  });

  it("hides AI tags for a standard-tier viewer even when content has them", () => {
    page.set({ ...basePageValue, data: { tier: "standard" } });
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }),
    });
    expect(screen.queryByText("ai")).not.toBeInTheDocument();
    expect(screen.queryByText("ml")).not.toBeInTheDocument();
  });

  it("shows AI tags for a pro-tier viewer", () => {
    page.set({ ...basePageValue, data: { tier: "pro" } });
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] }),
    });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });
});
