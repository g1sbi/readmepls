import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import CaptureBar from "./CaptureBar.svelte";

describe("CaptureBar", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes a stable input aria-label and a labelled send button", () => {
    render(CaptureBar, {});
    expect(
      screen.getByRole("textbox", { name: /paste a link/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save link/i }),
    ).toBeInTheDocument();
  });

  it("posts the url to /api/capture and clears on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onCaptured = vi.fn();
    render(CaptureBar, { onCaptured });

    const input = screen.getByRole("textbox", { name: /paste a link/i });
    await fireEvent.input(input, { target: { value: "https://example.com" } });
    await fireEvent.click(screen.getByRole("button", { name: /save link/i }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capture",
      expect.objectContaining({ method: "POST" }),
    );
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows a quota message on 402", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 402 })),
    );
    render(CaptureBar, {});
    await fireEvent.input(
      screen.getByRole("textbox", { name: /paste a link/i }),
      { target: { value: "https://example.com" } },
    );
    await fireEvent.click(screen.getByRole("button", { name: /save link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/quota/i);
  });

  it("shows a generic error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    render(CaptureBar, {});
    await fireEvent.input(
      screen.getByRole("textbox", { name: /paste a link/i }),
      { target: { value: "https://example.com" } },
    );
    await fireEvent.click(screen.getByRole("button", { name: /save link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not capture/i);
  });
});
