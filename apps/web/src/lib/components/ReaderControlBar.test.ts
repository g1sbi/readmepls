import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControlBar from "./ReaderControlBar.svelte";

describe("ReaderControlBar", () => {
  it("renders all four items when hasChapters is true", () => {
    render(ReaderControlBar, { hasChapters: true, onOpen: vi.fn() });
    expect(screen.getByRole("navigation", { name: "reader controls" })).toBeTruthy();
    for (const label of ["text", "chapters", "highlights", "more"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("omits chapters when hasChapters is false", () => {
    render(ReaderControlBar, { hasChapters: false, onOpen: vi.fn() });
    expect(screen.queryByText("chapters")).toBeNull();
    expect(screen.getByText("text")).toBeTruthy();
  });

  it("fires onOpen with the item key on click", async () => {
    const onOpen = vi.fn();
    render(ReaderControlBar, { hasChapters: true, onOpen });
    await fireEvent.click(screen.getByText("highlights"));
    expect(onOpen).toHaveBeenCalledWith("highlights");
  });

  it("marks the active item with aria-current", () => {
    render(ReaderControlBar, { hasChapters: true, active: "more", onOpen: vi.fn() });
    expect(screen.getByText("more").closest("button")!.getAttribute("aria-current")).toBe("true");
  });
});
