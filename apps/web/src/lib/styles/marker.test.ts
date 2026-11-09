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

// Every @media block with this exact query, brace-balanced.
function mediaList(query: string, source = css): string[] {
  const out: string[] = [];
  const re = /@media ([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if ((m[1] ?? "").trim() !== query) continue;
    let depth = 1;
    let k = re.lastIndex;
    while (depth > 0 && k < source.length) {
      if (source[k] === "{") depth++;
      else if (source[k] === "}") depth--;
      k++;
    }
    out.push(source.slice(m.index, k));
  }
  return out;
}

const mediaBlocks = (query: string) => mediaList(query).join("\n");

describe("marker.css", () => {
  it("swipe transitions background-size with the marker duration and ease", () => {
    const r = rule(".marker-swipe");
    expect(r).toMatch(
      /transition:[^;]*background-size[^;]*var\(--dur-marker\)[^;]*var\(--ease-out\)/,
    );
  });

  it("hover rules for both classes sit inside the hover-capable media query", () => {
    const blocks = mediaBlocks("(hover: hover) and (pointer: fine)");
    expect(blocks).toMatch(/\.marker-swipe:hover/);
    expect(blocks).toMatch(/\.marker-inverse:hover/);
    expect(blocks).toMatch(
      /\.marker-inverse:hover[^{]*\{[^}]*var\(--color-text-on-marker\)/,
    );
    // not leaking outside the query
    const outside = mediaList("(hover: hover) and (pointer: fine)").reduce(
      (acc, b) => acc.replace(b, ""),
      css,
    );
    expect(outside).not.toMatch(/:hover/);
  });

  it(".is-drawn draws both classes, inverse switching to on-marker text", () => {
    expect(rule(".marker-swipe.is-drawn")).toMatch(
      /background-size:\s*100% 42%/,
    );
    expect(rule(".marker-inverse.is-drawn")).toMatch(
      /background-size:\s*100% 100%/,
    );
    expect(rule(".marker-inverse.is-drawn")).toContain(
      "var(--color-text-on-marker)",
    );
  });

  it("reduced motion renders both classes already drawn", () => {
    const b = mediaBlocks("(prefers-reduced-motion: reduce)");
    expect(b).toMatch(/\.marker-swipe[^{]*\{[^}]*background-size:\s*100% 42%/);
    expect(b).toMatch(
      /\.marker-inverse[^{]*\{[^}]*background-size:\s*100% 100%/,
    );
    expect(b).toMatch(
      /\.marker-inverse[^{]*\{[^}]*color:\s*var\(--color-text-on-marker\)/,
    );
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
