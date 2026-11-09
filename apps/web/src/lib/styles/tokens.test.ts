import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/** Custom properties declared in the first `selector { … }` block. */
function block(source: string, selector: string): Map<string, string> {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = source.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1] ?? "", (m[2] ?? "").trim().replace(/\s+/g, " "));
  }
  return out;
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r = 0, g = 0, b = 0] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(css, ":root");
const dark = block(css, '[data-theme="dark"]');

const SEMANTIC = [
  "--color-bg",
  "--color-surface",
  "--color-surface-sunken",
  "--color-surface-raised",
  "--color-text",
  "--color-text-muted",
  "--color-text-subtle",
  "--color-hairline",
  "--color-inverse",
  "--color-text-inverse",
  "--color-accent",
  "--color-accent-hover",
  "--color-text-on-accent",
  "--color-accent-wash",
  "--color-marker",
  "--color-marker-soft",
  "--color-text-on-marker",
  "--color-border",
  "--color-border-strong",
  "--color-ring",
  "--color-selection",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--color-info",
  "--hl-terracotta",
  "--hl-amber",
  "--hl-sage",
  "--shadow-color",
  "--reading-text",
  "--reading-bg",
];
const MAY_INHERIT = new Set(["--color-marker", "--color-text-on-marker"]);

/** Resolve a token to a hex, following var() aliases (dark falls back to light). */
function hex(mode: Map<string, string>, name: string): string {
  const v = mode.get(name) ?? light.get(name);
  if (v === undefined) throw new Error(`${name} undefined`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? hex(mode, ref[1] ?? "") : v;
}

describe("tokens.css (Marker)", () => {
  it("defines every semantic token in light and dark", () => {
    for (const t of SEMANTIC) {
      expect(light.has(t), `light ${t}`).toBe(true);
      if (!MAY_INHERIT.has(t)) expect(dark.has(t), `dark ${t}`).toBe(true);
    }
  });

  it("has no sepia mode and no retired tokens", () => {
    expect(css).not.toContain('data-theme="sepia"');
    const retired =
      /--(?:texture-grain|grain-opacity|color-fold|color-bg-gradient|ease-paper|font-display|tracking-eyebrow|reading-font-sans|(?:paper|ink|terracotta|sage|amber|clay|dusk)-\d+|marker-(?:butter|rose|sky|mint))\b/;
    expect(css.match(retired)).toBeNull();
  });

  it("keeps every stored highlight key renderable", () => {
    for (const k of ["--hl-terracotta", "--hl-amber", "--hl-sage"]) {
      expect(light.has(k)).toBe(true);
      expect(dark.has(k)).toBe(true);
    }
  });

  it("meets contrast floors in both modes", () => {
    for (const [name, mode] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const h = (t: string) => hex(mode, t);
      const floor = (fg: string, bgs: string[], min: number) => {
        for (const bg of bgs) {
          expect(
            contrast(h(fg), h(bg)),
            `${name} ${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(min);
        }
      };
      floor(
        "--color-text",
        ["--color-bg", "--color-surface", "--color-surface-sunken"],
        7,
      );
      floor("--color-text-muted", ["--color-bg", "--color-surface"], 4.5);
      floor("--color-text-subtle", ["--color-bg", "--color-surface"], 3);
      floor("--color-text-inverse", ["--color-inverse"], 7);
      floor("--color-text-on-marker", ["--color-marker"], 7);
    }
  });

  it("uses one accent hue", () => {
    expect(hex(light, "--color-marker").toLowerCase()).toBe("#ffce00");
    expect(hex(dark, "--color-marker").toLowerCase()).toBe("#ffce00");
  });

  it("sets Ronzino for UI and reading", () => {
    expect(light.get("--font-ui")).toMatch(/^"Ronzino"/);
    expect(light.get("--font-reading")).toMatch(/^"Ronzino"/);
  });

  it("defaults body text to the UI font", () => {
    const appCss = readFileSync(join(__dirname, "..", "..", "app.css"), "utf8");
    const bodies = [...appCss.matchAll(/(?:^|\n)body \{([^}]*)\}/g)];
    expect(
      bodies.some((m) => /font-family:\s*var\(--font-ui\)/.test(m[1] ?? "")),
    ).toBe(true);
  });
});
