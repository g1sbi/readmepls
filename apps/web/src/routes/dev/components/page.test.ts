import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";

beforeEach(() => vi.resetModules());

describe("/dev/components", () => {
  it("404s outside dev", async () => {
    vi.doMock("$app/environment", () => ({ dev: false, browser: true }));
    const { load } = await import("./+page.js");
    let thrown: unknown;
    try {
      // load takes a LoadEvent we don't use
      (load as () => unknown)();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ status: 404 });
    vi.doUnmock("$app/environment");
  });

  it("does not throw in dev", async () => {
    vi.doMock("$app/environment", () => ({ dev: true, browser: true }));
    const { load } = await import("./+page.js");
    expect(() => (load as () => unknown)()).not.toThrow();
    vi.doUnmock("$app/environment");
  });

  it("renders the three sections in both modes", async () => {
    const { container } = render(Page);
    for (const name of ["Controls", "Overlays", "Cards & lists"]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
    expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
    expect(container.querySelector('[data-theme="light"]')).not.toBeNull();
    expect(container.querySelector(".max-w-\\[360px\\]")).not.toBeNull();
  }, 30_000);
});
