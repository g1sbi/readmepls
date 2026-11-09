import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Spinner from "./Spinner.svelte";

describe("ui primitives", () => {
  it("Spinner exposes an accessible label", () => {
    render(Spinner, { label: "Loading" });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});
