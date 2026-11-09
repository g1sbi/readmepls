import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import Harness from "./__fixtures__/Harness.svelte";

async function open(onpick = vi.fn()) {
  render(Harness, { onpick });
  await fireEvent.click(screen.getByRole("button", { name: "open menu" }));
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "pick me" })).toBeTruthy(),
  );
  return onpick;
}

describe("DropdownMenu", () => {
  it("items are at least 44px tall", async () => {
    await open();
    const item = screen.getByRole("menuitem", { name: "pick me" });
    expect(item.className).toContain("min-h-11");
  });

  it("destructive item is styled destructive", async () => {
    await open();
    const item = screen.getByRole("menuitem", { name: "remove" });
    expect(item.getAttribute("data-variant")).toBe("destructive");
    expect(item.className).toContain("text-destructive");
  });

  it("content is a Marker popover", async () => {
    await open();
    const cls = screen.getByRole("menu").className;
    for (const c of [
      "bg-popover",
      "rounded-lg",
      "ring-hairline",
      "shadow-lg",
      "p-1",
      "animate-in",
      "ease-out",
    ])
      expect(cls).toContain(c);
  });

  it("opens from the trigger and selects", async () => {
    const onpick = await open();
    await fireEvent.click(screen.getByRole("menuitem", { name: "pick me" }));
    expect(onpick).toHaveBeenCalled();
  });
});
