import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button from "./Button.svelte";
import Tag from "./Tag.svelte";
import Spinner from "./Spinner.svelte";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("ui primitives", () => {
  it("Button renders children and fires onclick", async () => {
    const onclick = vi.fn();
    render(Button, { children: text("Save"), onclick });
    const btn = screen.getByRole("button", { name: "Save" });
    await fireEvent.click(btn);
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("Button respects disabled", () => {
    render(Button, { children: text("X"), disabled: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("Tag renders its label", () => {
    render(Tag, { children: text("ai") });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("Spinner exposes an accessible label", () => {
    render(Spinner, { label: "Loading" });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("Button exposes its variant for styling", () => {
    render(Button, { children: text("Go"), variant: "accent" });
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("data-variant", "accent");
  });
});
