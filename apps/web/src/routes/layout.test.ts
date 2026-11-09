import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { page as pageStore } from "$app/stores";
import type { Writable } from "svelte/store";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: null },
    collection: () => ({ update: vi.fn() }),
  }),
}));

import Layout from "./+layout.svelte";

const children = createRawSnippet(() => ({
  render: () => `<p>page body</p>`,
}));

const collections = [{ id: "c1", name: "Rust reads", slug: "rust", count: 3 }];

// The vitest alias swaps in a writable stub (src/__mocks__/app-stores.ts).
const page = pageStore as unknown as Writable<unknown>;

function mount(pathname: string) {
  page.set({
    params: {},
    url: new URL(`http://localhost${pathname}`),
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    form: null,
    state: {},
  } as never);
  return render(Layout, {
    children,
    data: { tier: null, selfHosted: false, collections },
  } as never);
}

const pressCmdK = () =>
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  searchPalette.close();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("root layout shell", () => {
  it("app routes get the sidebar (with collections) and the tab bar", () => {
    mount("/library");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent("Rust reads");
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeTruthy();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByText("page body"),
    );
    expect(document.querySelector(".topbar")).toBeNull();
    // Phones: content clears the fixed tab bar; md+ has no tab bar.
    expect(screen.getByRole("main")).toHaveClass(
      "pb-[calc(5rem+env(safe-area-inset-bottom))]",
      "md:pb-0",
    );
    expect(document.querySelector(".progress")).toBeNull();
  });

  it("the reader shows neither the sidebar nor the tab bar", () => {
    mount("/read/x");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(document.querySelector(".progress")).not.toBeNull();
  });

  it.each(["/login", "/verify"])("%s shows only the page", (path) => {
    mount(path);
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("⌘K opens search in the app and the reader", () => {
    mount("/library");
    pressCmdK();
    expect(searchPalette.isOpen).toBe(true);
    cleanup();
    searchPalette.close();

    mount("/read/x");
    pressCmdK();
    expect(searchPalette.isOpen).toBe(true);
  });

  it("⌘K does nothing on login", () => {
    mount("/login");
    pressCmdK();
    expect(searchPalette.isOpen).toBe(false);
  });

  it("the old TopBar and BottomNav are gone", () => {
    // Built with path.resolve: Vite rewrites `new URL(lit, import.meta.url)`
    // into a served asset path, which isn't a filesystem path.
    const here = dirname(fileURLToPath(import.meta.url));
    const comp = (f: string) => resolvePath(here, "../lib/components", f);
    expect(existsSync(comp("TopBar.svelte"))).toBe(false);
    expect(existsSync(comp("BottomNav.svelte"))).toBe(false);
  });
});
