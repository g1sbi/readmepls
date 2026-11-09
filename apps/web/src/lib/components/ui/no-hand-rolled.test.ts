import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, globSync } from "node:fs";
import { resolve } from "node:path";

const uiDir = import.meta.dirname;
const srcRoot = resolve(uiDir, "../../..");

const RETIRED = [
  "Button",
  "Input",
  "Tag",
  "Chip",
  "Skeleton",
  "Spinner",
  "DropdownMenu",
  "MenuItem",
  "ConfirmDialog",
  "Sheet",
  "Card",
];

describe("shadcn-only primitives", () => {
  it("ui/ holds no hand-rolled replacement for a shadcn primitive", () => {
    const top = readdirSync(uiDir).filter((f) => f.endsWith(".svelte"));
    expect(top.length).toBeGreaterThan(0);
    const offenders = top.filter((f) =>
      RETIRED.includes(f.replace(/\.svelte$/, "")),
    );
    expect(offenders).toEqual([]);
  });

  it("nothing outside ui/ imports bits-ui", () => {
    const files = [
      ...globSync("**/*.svelte", { cwd: srcRoot }),
      ...globSync("**/*.ts", { cwd: srcRoot }),
    ];
    expect(files.length).toBeGreaterThan(10);
    const self = "lib/components/ui/no-hand-rolled.test.ts";
    const offenders = files.filter(
      (f) =>
        !f.startsWith("lib/components/ui/") &&
        f !== self &&
        /["']bits-ui(\/[^"']*)?["']/.test(
          readFileSync(resolve(srcRoot, f), "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
