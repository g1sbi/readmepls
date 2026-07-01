import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import Harness from "./__fixtures__/DropdownMenuHarness.svelte";

describe("DropdownMenu", () => {
  it("keeps the panel closed until the trigger is clicked", () => {
    render(Harness, { onpick: vi.fn() });
    expect(screen.queryByText("pick me")).not.toBeInTheDocument();
  });

  it("opens the panel and fires an item's onSelect", async () => {
    const onpick = vi.fn();
    render(Harness, { onpick });
    await fireEvent.click(screen.getByRole("button", { name: "open menu" }));
    await waitFor(() =>
      expect(screen.getByText("pick me")).toBeInTheDocument(),
    );
    await fireEvent.click(screen.getByText("pick me"));
    expect(onpick).toHaveBeenCalled();
  });
});
