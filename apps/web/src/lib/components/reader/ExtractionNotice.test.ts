import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ExtractionNotice from "./ExtractionNotice.svelte";

describe("ExtractionNotice", () => {
  it("says why a page could not be read, and offers a way on", async () => {
    const onRetry = vi.fn();
    render(ExtractionNotice, {
      status: "failed",
      reason: "Blocked by paywall",
      originalUrl: "https://example.com/p",
      onRetry,
    });
    expect(screen.getByText("Blocked by paywall")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open original/ })).toHaveAttribute(
      "href",
      "https://example.com/p",
    );
    await fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("falls back to plain words when there is no reason", () => {
    render(ExtractionNotice, {
      status: "failed",
      reason: null,
      originalUrl: null,
      onRetry: vi.fn(),
    });
    expect(screen.getByText("We couldn't read this page.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stays quiet about a partial extraction", () => {
    render(ExtractionNotice, {
      status: "partial",
      reason: "Recovered from web archive",
      originalUrl: "https://example.com/p",
    });
    expect(screen.getByText("Recovered from web archive")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  });
});
