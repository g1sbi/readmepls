import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ReaderSkeleton from "./ReaderSkeleton.svelte";

describe("ReaderSkeleton", () => {
  it("stands in for the article while it loads", () => {
    const { container } = render(ReaderSkeleton);
    expect(screen.getByLabelText("Loading article")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    // Shaped like the real page: a source pill, a two-line title, the meta
    // line and paragraphs.
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(8);
  });

  it("brings no chrome of its own", () => {
    render(ReaderSkeleton);
    expect(screen.queryByRole("navigation", { name: "Chapters" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "reader controls" }),
    ).toBeNull();
  });
});
