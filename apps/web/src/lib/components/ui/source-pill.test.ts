import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import SourcePill from "./SourcePill.svelte";

describe("SourcePill", () => {
  it("shows the name when present", () => {
    render(SourcePill, { name: "The New York Times", host: "nytimes.com" });
    expect(screen.getByText("The New York Times")).toBeInTheDocument();
  });

  it("falls back to the host when no name", () => {
    render(SourcePill, { name: null, host: "blog.acme.com" });
    expect(screen.getByText("blog.acme.com")).toBeInTheDocument();
  });

  it("renders the favicon img when iconUrl is set", () => {
    const { container } = render(SourcePill, { host: "nytimes.com", iconUrl: "https://x/i.png" });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://x/i.png");
  });

  it("renders a fallback glyph when no iconUrl", () => {
    const { container } = render(SourcePill, { host: "nytimes.com" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
