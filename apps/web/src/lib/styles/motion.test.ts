import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tokens = readFileSync(join(__dirname, "tokens.css"), "utf8");
const bridge = readFileSync(join(__dirname, "shadcn-bridge.css"), "utf8");
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf8"),
);

describe("motion tokens", () => {
  it("defines the named easings and durations", () => {
    const expected = [
      "--ease-out: cubic-bezier(0.075, 0.82, 0.165, 1);",
      "--ease-in: cubic-bezier(0.4, 0, 1, 1);",
      "--motion-bounce: cubic-bezier(0.175, 0.885, 0.325, 1.275);",
      "--ease-bounce: var(--motion-bounce);",
      "--dur-fast: 150ms;",
      "--dur-base: 250ms;",
      "--dur-slow: 450ms;",
      "--dur-marker: 600ms;",
      "--dur-view: var(--dur-base);",
    ];
    for (const line of expected) expect(tokens).toContain(line);
  });

  it("zeroes every duration under reduced motion", () => {
    const start = tokens.indexOf("prefers-reduced-motion: reduce");
    expect(start).toBeGreaterThan(-1);
    const rest = tokens.slice(start);
    for (const t of ["fast", "base", "slow", "marker"]) {
      expect(rest).toContain(`--dur-${t}: 0ms;`);
    }
  });

  it("ships the shared enter/exit library", () => {
    expect(pkg.devDependencies["tw-animate-css"]).toMatch(/^\d/);
    expect(bridge).toContain('@import "tw-animate-css"');
  });

  it("registers ease-bounce as a Tailwind easing", () => {
    const theme = bridge.slice(bridge.indexOf("@theme inline"));
    expect(theme).toContain("--ease-bounce: var(--motion-bounce);");
    expect(theme).not.toContain("cubic-bezier");
  });
});
