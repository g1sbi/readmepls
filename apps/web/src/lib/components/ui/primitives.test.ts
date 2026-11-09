import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Tag from "./Tag.svelte";
import Spinner from "./Spinner.svelte";

const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("ui primitives", () => {
  it("Tag renders its label", () => {
    render(Tag, { children: text("ai") });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("Tag renders its label through the shadcn Badge", () => {
    render(Tag, {
      props: { children: createRawSnippet(() => ({ render: () => "ai" })) },
    });
    const el = screen.getByText("ai");
    // shadcn Badge renders a data-slot="badge" attribute on its root element.
    expect(el.closest('[data-slot="badge"]')).not.toBeNull();
  });

  it("Spinner exposes an accessible label", () => {
    render(Spinner, { label: "Loading" });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});
