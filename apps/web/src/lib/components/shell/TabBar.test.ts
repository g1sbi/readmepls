import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import TabBar from "./TabBar.svelte";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

const scrollTo = (y: number) => {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
};

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

  it("marks no tab current on a reader route", () => {
    mount("/read/x");
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute(
      "aria-current",
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

  describe("hide on scroll", () => {
    // jsdom has no `inert` reflection, so Svelte may set an expando property.
    const isInert = () =>
      nav().hasAttribute("inert") ||
      (nav() as HTMLElement & { inert?: boolean }).inert === true;
    const nav = () => screen.getByRole("navigation", { name: "Tabs" });
    const stubRaf = () =>
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    it("hides and goes inert on scroll down, returns on scroll up", async () => {
      stubRaf();
      mount("/");
      expect(isInert()).toBe(false);
      scrollTo(200);
      await tick();
      expect(nav()).toHaveClass("translate-y-full");
      expect(isInert()).toBe(true);
      scrollTo(100);
      await tick();
      expect(nav()).not.toHaveClass("translate-y-full");
      expect(isInert()).toBe(false);
    });

    it("stays visible while More is open", async () => {
      stubRaf();
      mount("/", { moreOpen: true });
      scrollTo(200);
      await tick();
      expect(nav()).not.toHaveClass("translate-y-full");
      expect(isInert()).toBe(false);
    });

    it("removes its scroll listener on unmount", () => {
      const remove = vi.spyOn(window, "removeEventListener");
      const { unmount } = render(TabBar, {
        pathname: "/",
        onMore: () => {},
        moreOpen: false,
      } as never);
      unmount();
      expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    });
  });
});
