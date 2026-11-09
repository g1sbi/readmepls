import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

describe("feedback primitives", () => {
  it("Skeleton stops pulsing under reduced motion", () => {
    const { container } = render(Skeleton);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el?.className).toContain("motion-reduce:animate-none");
    expect(el?.className).toContain("bg-secondary");
  });

  it("Spinner announces its label", () => {
    render(Spinner, { props: { label: "Processing" } });
    const el = screen.getByRole("status", { name: "Processing" });
    expect(el.getAttribute("class")).toContain("motion-reduce:animate-none");
  });

  it("Spinner defaults its label to Loading", () => {
    render(Spinner);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("the hand-rolled Skeleton and Spinner are gone", () => {
    const files = Object.keys(import.meta.glob("./*.svelte"));
    expect(files).not.toContain("./Skeleton.svelte");
    expect(files).not.toContain("./Spinner.svelte");
  });
});
