import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import TabBar from "./TabBar.svelte";

const mount = (pathname: string, over: Record<string, unknown> = {}) => {
  const onMore = vi.fn();
  render(TabBar, { pathname, onMore, moreOpen: false, ...over } as never);
  return { onMore };
};

describe("TabBar", () => {
  it("has exactly three tabs: Home, Library, More", () => {
    mount("/");
    const nav = screen.getByRole("navigation", { name: "Tabs" });
    const tabs = [...nav.querySelectorAll("a, button")].map((e) =>
      e.textContent?.trim(),
    );
    expect(tabs).toEqual(["Home", "Library", "More"]);
  });

  it("marks Library current on a reader route", () => {
    mount("/read/x");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each(["/collections", "/collections/physics", "/settings"])(
    "marks More current on %s",
    (p) => {
      mount(p);
      const more = screen.getByRole("button", { name: "More" });
      expect(more).toHaveAttribute("aria-current", "page");
      expect(more.querySelector(".marker")).not.toBeNull();
    },
  );

  it("wraps the active label in the marker", () => {
    mount("/library");
    expect(
      screen.getByRole("link", { name: "Library" }).querySelector(".marker"),
    ).toHaveTextContent("Library");
  });

  it("calls onMore and reflects moreOpen", async () => {
    const { onMore } = mount("/", { moreOpen: true });
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "true");
    await fireEvent.click(more);
    expect(onMore).toHaveBeenCalledOnce();
  });

  it("is phone-only and respects the safe area", () => {
    mount("/");
    const root = screen.getByRole("navigation", { name: "Tabs" });
    expect(root).toHaveClass("md:hidden");
    expect(root.className).toContain("pb-[env(safe-area-inset-bottom)]");
  });
});
