import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("shadcn ↔ tokens bridge", () => {
  const css = () =>
    readFileSync(resolve(__dirname, "../../styles/shadcn-bridge.css"), "utf8");

  it("registers the dark variant against [data-theme], not .dark", () => {
    expect(css()).toContain('@custom-variant dark ([data-theme="dark"] &)');
  });

  it("maps every shadcn alias var to a tokens.css --color-* token, not a literal", () => {
    const c = css();
    for (const [alias, token] of [
      ["--background", "--color-bg"],
      ["--foreground", "--color-text"],
      ["--primary", "--color-accent"],
      ["--primary-foreground", "--color-text-on-accent"],
      ["--secondary", "--color-surface-sunken"],
      ["--secondary-foreground", "--color-text-muted"],
      ["--muted-foreground", "--color-text-subtle"],
      ["--accent", "--color-accent-wash"],
      ["--destructive", "--color-danger"],
      ["--border", "--color-border"],
      ["--ring", "--color-ring"],
    ]) {
      expect(c).toMatch(new RegExp(`${alias}:\\s*var\\(${token}\\)`));
    }
  });

  it("bridges Marker roles", () => {
    const c = css();
    for (const [alias, token] of [
      ["--marker", "--color-marker"],
      ["--marker-foreground", "--color-text-on-marker"],
      ["--inverse", "--color-inverse"],
      ["--inverse-foreground", "--color-text-inverse"],
      ["--hairline", "--color-hairline"],
    ]) {
      expect(c).toMatch(new RegExp(`${alias}:\\s*var\\(${token}\\)`));
    }
    for (const name of ["marker", "inverse", "hairline"]) {
      expect(c).toMatch(new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`));
    }
    for (const name of ["marker", "inverse"]) {
      expect(c).toMatch(
        new RegExp(
          `--color-${name}-foreground:\\s*var\\(--${name}-foreground\\)`,
        ),
      );
    }
  });

  it("pins the two app breakpoints", () => {
    const c = css();
    expect(c).toMatch(/--breakpoint-sm:\s*40rem/);
    expect(c).toMatch(/--breakpoint-lg:\s*64rem/);
  });
});
