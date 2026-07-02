import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Chip from "./Chip.svelte";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("Chip", () => {
  it("renders its label", () => {
    render(Chip, { children: text("ai") });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("exposes a selected state for styling", () => {
    const { container } = render(Chip, { children: text("all"), selected: true });
    expect(container.querySelector(".chip")?.getAttribute("data-selected")).toBe("true");
  });
});
