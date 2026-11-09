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

// Pre-existing direct bits-ui consumers awaiting migration to a shadcn
// primitive (Popover). Do not add to this list.
const BITS_UI_ALLOWLIST = ["lib/components/HighlightPopover.svelte"];

describe("shadcn-only primitives", () => {
  it("ui/ holds no hand-rolled replacement for a shadcn primitive", () => {
    const top = readdirSync(uiDir).filter((f) => f.endsWith(".svelte"));
    expect(top.length).toBeGreaterThan(0);
    const offenders = top.filter((f) =>
      RETIRED.includes(f.replace(/\.svelte$/, "")),
    );
    expect(offenders).toEqual([]);
  });

  it("no .svelte outside ui/ imports bits-ui", () => {
    const files = globSync("**/*.svelte", { cwd: srcRoot });
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter(
      (f) =>
        !f.startsWith("lib/components/ui/") &&
        !BITS_UI_ALLOWLIST.includes(f) &&
        /from\s+["']bits-ui["']/.test(
          readFileSync(resolve(srcRoot, f), "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
