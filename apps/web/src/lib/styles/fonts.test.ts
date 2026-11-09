import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = () => readFileSync(resolve(__dirname, "fonts.css"), "utf8");
const html = () =>
  readFileSync(resolve(__dirname, "../../app.html"), "utf8");

describe("fonts.css", () => {
  it("declares Ronzino in 3 weights × normal/italic", () => {
    const blocks = css().match(/@font-face\s*{[^}]*}/g) ?? [];
    const cases: [number, string][] = [
      [400, "normal"],
      [400, "italic"],
      [500, "normal"],
      [500, "italic"],
      [700, "normal"],
      [700, "italic"],
    ];
    for (const [weight, style] of cases) {
      const hit = blocks.find(
        (b) =>
          b.includes('font-family: "Ronzino"') &&
          new RegExp(`font-weight:\\s*${weight};`).test(b) &&
          new RegExp(`font-style:\\s*${style};`).test(b) &&
          b.includes("font-display: swap") &&
          /\/fonts\/ronzino-[\w-]+\.woff2/.test(b),
      );
      expect(hit, `Ronzino ${weight} ${style}`).toBeDefined();
    }
  });

  it("drops the warm-paper faces", () => {
    expect(css()).not.toMatch(/Fredoka|Newsreader|IBM Plex Sans/);
  });

  it("every referenced font file exists", () => {
    const urls = [...css().matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(
        existsSync(resolve(__dirname, "../../../static", "." + u)),
        u,
      ).toBe(true);
    }
  });
});

describe("app.html", () => {
  it("preloads Ronzino regular + medium, not the old faces", () => {
    const h = html();
    expect(h).toContain("fonts/ronzino-regular.woff2");
    expect(h).toContain("fonts/ronzino-medium.woff2");
    expect(h).not.toMatch(/fredoka|newsreader/);
  });
});
