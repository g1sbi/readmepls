import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";
import Button, { buttonVariants } from "./button.svelte";

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

  it("no consumer imports the hand-rolled Button", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const files = globSync("**/*.svelte", { cwd: root });
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /ui\/Button\.svelte|from "\.\/Button\.svelte"/.test(
        readFileSync(resolve(root, f), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
