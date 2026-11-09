import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Badge, { badgeVariants } from "./badge.svelte";

const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("Badge", () => {
  it("chip shows selection via data-selected", () => {
    render(Badge, { variant: "chip", selected: true, children: text("ai") });
    const el = screen.getByText("ai").closest('[data-slot="badge"]')!;
    expect(el.getAttribute("data-selected")).toBe("true");
    const cls = badgeVariants({ variant: "chip" });
    expect(cls).toContain("data-[selected=true]:bg-inverse");
    expect(cls).toContain("data-[selected=true]:text-inverse-foreground");
    expect(cls).toContain("h-9");
    expect(cls).toContain("rounded-full");
  });

  it("tag is quiet: secondary tone, xs text", () => {
    const cls = badgeVariants({ variant: "tag" });
    expect(cls).toContain("bg-secondary");
    expect(cls).toContain("text-secondary-foreground");
    expect(cls).toContain("text-xs");
    expect(cls).toContain("h-6");
  });

  it("offers outline and marker variants", () => {
    expect(badgeVariants({ variant: "marker" })).toContain("bg-marker");
    expect(badgeVariants({ variant: "outline" })).toContain("ring-hairline");
  });
});
