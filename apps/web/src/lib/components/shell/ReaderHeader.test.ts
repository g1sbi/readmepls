import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

const { media } = vi.hoisted(() => ({
  media: { desktop: false, queries: [] as string[] },
}));
vi.mock("svelte/reactivity", async (orig) => ({
  ...(await orig<typeof import("svelte/reactivity")>()),
  MediaQuery: class {
    constructor(readonly query: string) {
      media.queries.push(query);
    }
    get current() {
      return media.desktop;
    }
  },
}));
import { createRawSnippet } from "svelte";
import ReaderHeader from "./ReaderHeader.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

const mount = (over: Record<string, unknown> = {}) => {
  const onMenu = vi.fn();
  const r = render(ReaderHeader, {
    backHref: "/collections/physics",
    hidden: false,
    onMenu,
    ...over,
  } as never);
  return { onMenu, ...r };
};

describe("ReaderHeader", () => {
  beforeEach(() => {
    media.desktop = false;
    searchPalette.close();
    document.documentElement.style.removeProperty("--topbar-h");
  });

  it("links Back to the given origin", () => {
    mount();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/collections/physics",
    );
  });

  it("opens the search palette", async () => {
    const spy = vi.spyOn(searchPalette, "open");
    mount();
    await fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(spy).toHaveBeenCalled();
  });

  it("opens the navigation from Menu", async () => {
    const { onMenu } = mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "Open navigation" }),
    );
    expect(onMenu).toHaveBeenCalled();
  });

  it("slides away below the focused breakpoint only when hidden", async () => {
    const { container, rerender } = mount();
    const header = container.querySelector("header")!;
    expect(header.className).not.toMatch(/-translate-y-full/);
    await rerender({ hidden: true });
    expect(header.className.split(/\s+/)).toContain("max-lg:-translate-y-full");
    expect(header.className.split(/\s+/)).toContain(
      "motion-reduce:transition-none",
    );
  });

  describe("inert while hidden", () => {
    // jsdom has no `inert` reflection, so Svelte may set an expando property.
    const isInert = (el: HTMLElement) =>
      el.hasAttribute("inert") ||
      (el as HTMLElement & { inert?: boolean }).inert === true;

    it("takes itself out of the tab order when hidden below lg", async () => {
      const { container, rerender } = mount();
      const header = container.querySelector("header")!;
      expect(isInert(header)).toBe(false);
      await rerender({ hidden: true });
      expect(isInert(header)).toBe(true);
      await rerender({ hidden: false });
      expect(isInert(header)).toBe(false);
    });

    it("stays usable from lg up, where it never slides away", () => {
      media.desktop = true;
      const { container } = mount({ hidden: true });
      expect(isInert(container.querySelector("header")!)).toBe(false);
      expect(media.queries).toContain("(min-width: 64rem)");
    });
  });

  it("gives every control a 44px target", () => {
    mount();
    expect(screen.getByRole("link", { name: "Back" }).className).toMatch(
      /\bh-11\b/,
    );
    for (const name of ["Search", "Open navigation"])
      expect(
        screen.getByRole("button", { name }).className.split(/\s+/),
      ).toContain("size-11");
  });

  // The reader's sticky rail and highlights column pin below this bar.
  it("publishes its height as --topbar-h", () => {
    mount();
    expect(
      document.documentElement.style.getPropertyValue("--topbar-h"),
    ).not.toBe("");
  });
});

describe("ReaderHeader — focused desktop", () => {
  const actions = createRawSnippet(() => ({
    render: () => `<button>Article actions</button>`,
  }));

  beforeEach(() => {
    media.desktop = true;
  });

  it("counts the highlights and opens the panel", async () => {
    const onHighlights = vi.fn();
    mount({ highlightsCount: 3, onHighlights });
    const btn = screen.getByRole("button", { name: "Highlights, 3" });
    expect(btn).toHaveTextContent("3");
    await fireEvent.click(btn);
    expect(onHighlights).toHaveBeenCalled();
  });

  it("renders the actions snippet after the highlights button", () => {
    mount({ highlightsCount: 0, onHighlights: vi.fn(), actions });
    const controls = screen.getAllByRole("button");
    const at = (el: Element) => controls.indexOf(el as HTMLElement);
    expect(at(screen.getByRole("button", { name: "Search" }))).toBeLessThan(
      at(screen.getByRole("button", { name: "Highlights, 0" })),
    );
    expect(
      at(screen.getByRole("button", { name: "Highlights, 0" })),
    ).toBeLessThan(at(screen.getByText("Article actions")));
    expect(at(screen.getByText("Article actions"))).toBeLessThan(
      at(screen.getByRole("button", { name: "Open navigation" })),
    );
  });

  it("leaves the highlights button and actions to the phone chrome", () => {
    media.desktop = false;
    mount({ highlightsCount: 3, onHighlights: vi.fn(), actions });
    expect(screen.queryByRole("button", { name: "Highlights, 3" })).toBeNull();
    expect(screen.queryByText("Article actions")).toBeNull();
  });

  // It stays mounted so it can fade rather than pop; only its opacity and
  // its presence to a screen reader change.
  it("fades the article title in once the h1 has scrolled away", async () => {
    const { rerender } = mount({ title: "Navier-Stokes equations" });
    const title = screen.getByText("Navier-Stokes equations");
    expect(title.className.split(/\s+/)).toContain("opacity-0");
    expect(title).toHaveAttribute("aria-hidden", "true");
    await rerender({
      backHref: "/library",
      hidden: false,
      onMenu: vi.fn(),
      title: "Navier-Stokes equations",
      showTitle: true,
    });
    expect(title.className.split(/\s+/)).toContain("opacity-100");
    expect(title).not.toHaveAttribute("aria-hidden");
  });

  it("keeps the title to itself on phones", () => {
    media.desktop = false;
    mount({ title: "Navier-Stokes equations", showTitle: true });
    expect(screen.queryByText("Navier-Stokes equations")).toBeNull();
  });
});
