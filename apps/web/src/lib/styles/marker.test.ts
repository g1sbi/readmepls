import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "marker.css"), "utf8");

function rule(selector: string): string {
  const m = css.match(
    new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`),
  );
  return m?.[1] ?? "";
}

describe("marker.css", () => {
  it("swipe transitions background-size with the marker duration and ease", () => {
    const r = rule(".marker-swipe");
    expect(r).toMatch(
      /transition:[^;]*background-size[^;]*var\(--dur-marker\)[^;]*var\(--ease-out\)/,
    );
  });

  it("hover rule sits inside the hover-capable media query", () => {
    const m = css.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?\n\})/,
    );
    expect(m?.[1]).toMatch(/\.marker-swipe:hover/);
  });

  it("uses marker tokens for the band", () => {
    expect(rule(".marker")).toContain("var(--color-marker-soft)");
    expect(rule(".marker-swipe")).toContain("var(--color-marker-soft)");
    expect(rule(".marker-inverse")).toContain("var(--color-marker)");
    expect(css).toContain("var(--color-text-on-marker)");
  });

  it("has no literal colors", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
  });
});
