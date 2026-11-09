import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Card from "./card.svelte";

describe("Card", () => {
  it("is a hairline-ringed 16px surface", () => {
    const { container } = render(Card);
    const cls = container.querySelector('[data-slot="card"]')!.className;
    for (const c of ["bg-card", "rounded-lg", "ring-1", "ring-hairline", "p-4"])
      expect(cls.split(/\s+/)).toContain(c);
  });

  it("lifts on hover only for fine pointers and not under reduced motion", () => {
    const { container } = render(Card, { interactive: true });
    const cls = container.querySelector('[data-slot="card"]')!.className;
    for (const c of [
      "[@media(hover:hover)]:hover:-translate-y-0.5",
      "[@media(hover:hover)]:hover:shadow-md",
      "transition-[transform,box-shadow]",
      "duration-[var(--dur-base)]",
      "ease-out",
      "motion-reduce:transform-none",
    ])
      expect(cls.split(/\s+/)).toContain(c);
  });

  it("does not lift unless interactive", () => {
    const { container } = render(Card);
    const cls = container.querySelector('[data-slot="card"]')!.className;
    expect(cls).not.toContain("hover:-translate-y");
  });
});
