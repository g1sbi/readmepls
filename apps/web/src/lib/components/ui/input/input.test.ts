import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";
import Input from "./input.svelte";
import Harness from "./input-harness.svelte";

describe("Input", () => {
  it("is a 44px pill with a focus ring", () => {
    render(Input, { "aria-label": "x", placeholder: "p" });
    const cls = screen.getByLabelText("x").className;
    for (const c of [
      "h-11",
      "rounded-full",
      "px-4",
      "bg-card",
      "ring-hairline",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
      "aria-invalid:ring-destructive",
      "disabled:opacity-50",
    ]) {
      expect(cls).toContain(c);
    }
  });

  it("binds value", async () => {
    render(Harness);
    await fireEvent.input(screen.getByLabelText("field"), {
      target: { value: "hello" },
    });
    expect(screen.getByTestId("out").textContent).toBe("hello");
  });

  it("no consumer imports the hand-rolled Input", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const files = globSync("**/*.svelte", { cwd: root });
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /ui\/Input\.svelte|from "\.\/Input\.svelte"/.test(
        readFileSync(resolve(root, f), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
