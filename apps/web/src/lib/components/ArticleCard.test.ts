import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
});

describe("ArticleCard", () => {
  it("shows the title and tags when ready", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }),
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
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
});
