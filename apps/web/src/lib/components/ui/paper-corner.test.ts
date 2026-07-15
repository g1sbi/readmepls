import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PaperCorner from "./PaperCorner.svelte";

describe("PaperCorner", () => {
  it("renders a decorative, non-announced element", () => {
    const { container } = render(PaperCorner);
    const el = container.querySelector("span.paper-corner");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the size as a custom property", () => {
    const { container } = render(PaperCorner, { size: 64 });
    const el = container.querySelector("span.paper-corner") as HTMLElement;
    expect(el.style.getPropertyValue("--corner-size")).toBe("64px");
  });
});
