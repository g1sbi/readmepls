import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tokens = readFileSync(join(__dirname, "tokens.css"), "utf8");
const reading = readFileSync(join(__dirname, "reading.css"), "utf8");
const app = readFileSync(join(__dirname, "..", "..", "app.css"), "utf8");

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Body of the brace-balanced block opened at `from`. */
function bodyAt(source: string, from: number): string {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return "";
}

/** Body of the first block whose prelude is exactly `prelude`. */
function blockOf(source: string, prelude: string): string {
  const src = strip(source);
  const re = new RegExp(
    `(?:^|[}\\s])${prelude.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`,
  );
  const m = re.exec(src);
  if (!m) throw new Error(`no block for ${prelude}`);
  return bodyAt(src, m.index + m[0].length - 1);
}

/** Every rule body in `source` whose selector list contains `selector`. */
function rulesFor(source: string, selector: string): string {
  const src = strip(source);
  const out: string[] = [];
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = (m[1] ?? "").split(",").map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2] ?? "");
  }
  return out.join("\n");
}

describe("reading tokens", () => {
  it("steps the body size per breakpoint", () => {
    expect(blockOf(tokens, ":root")).toMatch(/--reading-size:\s*1\.0625rem;/);
    const tablet = blockOf(
      blockOf(tokens, "@media (min-width: 40rem)"),
      ":root",
    );
    expect(tablet).toMatch(/--reading-size:\s*1\.125rem;/);
    const desk = blockOf(blockOf(tokens, "@media (min-width: 64rem)"), ":root");
    expect(desk).toMatch(/--reading-size:\s*1\.1875rem;/);
  });

  it("opens the leading in dark", () => {
    expect(blockOf(tokens, '[data-theme="dark"]')).toMatch(
      /--reading-leading-adjust:\s*0\.05;/,
    );
  });
});

describe("reading.css", () => {
  it("is imported from app.css", () => {
    expect(app).toMatch(/@import\s+["'][^"']*reading\.css["']/);
  });

  it("scrolls tables inside themselves", () => {
    const t = rulesFor(reading, ".prose-reader table");
    expect(t).toMatch(/display:\s*block/);
    expect(t).toMatch(/overflow-x:\s*auto/);
  });

  it("scrolls code blocks and display math inside themselves", () => {
    expect(rulesFor(reading, ".prose-reader pre")).toMatch(
      /overflow-x:\s*auto/,
    );
    expect(rulesFor(reading, '.prose-reader math[display="block"]')).toMatch(
      /overflow-x:\s*auto/,
    );
  });

  it("caps images at the column", () => {
    expect(rulesFor(reading, ".prose-reader img")).toMatch(/max-width:\s*100%/);
  });

  it("uses a neutral prose selection", () => {
    expect(rulesFor(reading, ".prose-reader ::selection")).toMatch(
      /var\(--color-prose-selection\)/,
    );
  });

  it("keys highlight bands on data-hl-color", () => {
    const sel = '.prose-reader mark[data-hl-color="terracotta"]';
    expect(rulesFor(reading, sel)).toMatch(/var\(--hl-terracotta\)/);
  });

  it("hardcodes no colors", () => {
    expect(strip(reading)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
