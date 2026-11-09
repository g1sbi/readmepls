import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(svelte|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).filter(
  (p) =>
    !p.endsWith(join("lib", "styles", "tokens.css")) && !/\.test\.ts$/.test(p),
);

const RETIRED = [
  "texture-grain",
  "grain-opacity",
  "color-fold",
  "color-bg-gradient",
  "ease-paper",
  "font-display",
  "tracking-eyebrow",
  "reading-font-sans",
  "(?:paper|ink|terracotta|sage|amber|clay|dusk)-\\d+",
  "marker-(?:butter|rose|sky|mint)",
];
const RE = new RegExp(`var\\(--(?:${RETIRED.join("|")})\\b`);

describe("retired paper tokens", () => {
  it("no source file references a retired token", () => {
    const offenders = files
      .filter((p) => RE.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p));
    expect(offenders).toEqual([]);
  });

  it("PaperCorner is gone", () => {
    const offenders = files
      .filter((p) => readFileSync(p, "utf8").includes("PaperCorner"))
      .map((p) => relative(SRC, p));
    expect(offenders).toEqual([]);
  });
});
