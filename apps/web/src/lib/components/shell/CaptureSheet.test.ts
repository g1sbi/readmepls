import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const mq = vi.hoisted(() => ({ matches: false }));
vi.mock("svelte/reactivity", async (orig) => ({
  ...(await orig<typeof import("svelte/reactivity")>()),
  MediaQuery: class {
    get current() {
      return mq.matches;
    }
  },
}));

import CaptureSheet from "./CaptureSheet.svelte";

describe("CaptureSheet", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a Dialog when wide", async () => {
    mq.matches = true;
    render(CaptureSheet, { open: true, onClose: () => {} });
    expect(await screen.findByText("Save a link")).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='dialog-content']"),
    ).not.toBeNull();
    expect(document.querySelector("[data-slot='drawer-content']")).toBeNull();
  });

  it("renders a BottomSheet when narrow", async () => {
    mq.matches = false;
    render(CaptureSheet, { open: true, onClose: () => {} });
    expect(await screen.findByText("Save a link")).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='drawer-content']"),
    ).not.toBeNull();
    expect(document.querySelector("[data-slot='dialog-content']")).toBeNull();
  });

  it.each([true, false])(
    "closes after a successful save (wide=%s)",
    async (wide) => {
      mq.matches = wide;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      );
      const onClose = vi.fn();
      render(CaptureSheet, { open: true, onClose });
      const input = await screen.findByPlaceholderText("Paste a link");
      await fireEvent.input(input, {
        target: { value: "https://example.com" },
      });
      await fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    },
  );
});
