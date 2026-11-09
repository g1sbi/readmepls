import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import InputGroupButton from "./input-group-button.svelte";

const text = (s: string) =>
  createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

const cls = (size?: "sm" | "icon-sm" | "icon") => {
  const { unmount } = render(InputGroupButton, {
    size,
    "aria-label": "Go",
    children: text("Go"),
  });
  const c = screen.getByRole("button", { name: "Go" }).className;
  unmount();
  return c.split(/\s+/);
};

describe("InputGroup.Button", () => {
  it("takes its size from Button", () => {
    expect(cls("icon-sm")).toEqual(
      expect.arrayContaining(["size-9", "after:-inset-1"]),
    );
    expect(cls("icon")).toContain("size-11");
    expect(cls("icon")).not.toContain("h-11");
  });

  it("defaults to Button's sm, with the 44px hit area", () => {
    expect(cls()).toEqual(expect.arrayContaining(["h-9", "after:-inset-1"]));
    expect(cls()).not.toContain("h-11");
  });
});
