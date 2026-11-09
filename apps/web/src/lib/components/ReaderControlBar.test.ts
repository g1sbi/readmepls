import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControlBar from "./ReaderControlBar.svelte";

describe("ReaderControlBar", () => {
  it("renders three items when hasChapters is true", () => {
    render(ReaderControlBar, { hasChapters: true, onOpen: vi.fn() });
    expect(
      screen.getByRole("navigation", { name: "reader controls" }),
    ).toBeTruthy();
    for (const label of ["Chapters", "Highlights", "More"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("omits chapters when hasChapters is false", () => {
    render(ReaderControlBar, { hasChapters: false, onOpen: vi.fn() });
    expect(screen.queryByText("Chapters")).toBeNull();
    expect(screen.queryByText("text")).toBeNull();
    expect(screen.queryByText("Text")).toBeNull();
    expect(screen.getByText("Highlights")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
  });

  it("fires onOpen with the item key on click", async () => {
    const onOpen = vi.fn();
    render(ReaderControlBar, { hasChapters: true, onOpen });
    await fireEvent.click(screen.getByText("Highlights"));
    expect(onOpen).toHaveBeenCalledWith("highlights");
  });

  it("marks the active item with aria-current", () => {
    render(ReaderControlBar, {
      hasChapters: true,
      active: "more",
      onOpen: vi.fn(),
    });
    expect(
      screen.getByText("More").closest("button")!.getAttribute("aria-current"),
    ).toBe("true");
  });
});
