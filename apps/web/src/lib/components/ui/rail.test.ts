import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Rail from "./Rail.svelte";

const child = createRawSnippet(() => ({ render: () => `<p>rail content</p>` }));

describe("Rail", () => {
  it("renders children inside a labelled aside", () => {
    render(Rail, { children: child, label: "reading controls" });
    const region = screen.getByRole("complementary", { name: "reading controls" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("rail content")).toBeInTheDocument();
  });
});
