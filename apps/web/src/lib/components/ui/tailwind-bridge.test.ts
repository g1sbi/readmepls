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
});
