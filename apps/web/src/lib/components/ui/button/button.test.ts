import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button, { buttonVariants, chipButton } from "./button.svelte";

const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("Button", () => {
  it("is a pill with a visible focus ring", () => {
    render(Button, { children: text("Go") });
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("focus-visible:ring-2");
  });

  it("meets 44px at every size", () => {
    const cls = (size: "default" | "sm" | "lg" | "icon" | "icon-sm") =>
      buttonVariants({ size });
    expect(cls("default")).toContain("h-11");
    expect(cls("lg")).toContain("h-12");
    expect(cls("icon")).toContain("size-11");
    expect(cls("sm")).toContain("after:-inset-1");
    expect(cls("icon-sm")).toContain("after:-inset-1");
  });

  it("offers no size below the 44px floor", () => {
    expect(Object.keys(buttonVariants.variants.size)).toEqual([
      "default",
      "sm",
      "lg",
      "icon",
      "icon-sm",
    ]);
  });

  it("reserves marker yellow for the marker variant", () => {
    const withMarker = Object.entries(buttonVariants.variants.variant)
      .filter(([, v]) => String(v).includes("bg-marker"))
      .map(([k]) => k);
    expect(withMarker).toEqual(["marker"]);
  });

  it("renders destructive as a soft red pill at rest", () => {
    const cls = buttonVariants({ variant: "destructive" });
    expect(cls).toContain("bg-destructive/10");
    expect(cls).toContain("hover:bg-destructive/20");
    expect(cls).toContain("color-mix(in_srgb,var(--color-destructive)");
  });

  it("underlines the link variant with the marker", () => {
    const cls = buttonVariants({ variant: "link" });
    // word-bounded: a bare toContain("underline") also matches no-underline
    expect(cls).toMatch(/(^|\s)underline(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)no-underline(\s|$)/);
    expect(cls).toContain("decoration-marker");
    expect(cls).toContain("text-foreground");
  });

  it("gives chip buttons the same visible focus ring", () => {
    const cls = chipButton.split(/\s+/);
    for (const c of [
      "outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-background",
    ])
      expect(cls, c).toContain(c);
  });
});
