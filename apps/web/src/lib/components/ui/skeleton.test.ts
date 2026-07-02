import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Skeleton from "./Skeleton.svelte";

describe("Skeleton", () => {
  it("is decorative (aria-hidden) so it is not announced as content", () => {
    const { container } = render(Skeleton);
    const root = container.querySelector(".skeleton");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders one line by default and the requested number when asked", () => {
    const { container } = render(Skeleton, { lines: 3 });
    expect(container.querySelectorAll(".skeleton-line").length).toBe(3);
  });
});
