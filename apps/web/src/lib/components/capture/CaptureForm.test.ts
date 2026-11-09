import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { invalidateAll } from "$app/navigation";
import { CAPTURE_MESSAGES } from "$lib/capture/submit.js";
import { captureSaved } from "$lib/capture/saved.svelte.js";
import CaptureForm from "./CaptureForm.svelte";

const stubFetch = (status: number | Error) =>
  vi.stubGlobal(
    "fetch",
    status instanceof Error
      ? vi.fn().mockRejectedValue(status)
      : vi.fn().mockResolvedValue(new Response(null, { status })),
  );

const type = async (value: string) => {
  const input = screen.getByRole("textbox");
  await fireEvent.input(input, { target: { value } });
  return input as HTMLInputElement;
};
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("CaptureForm", () => {
  beforeEach(() => {
    vi.mocked(invalidateAll).mockClear();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("on success: invalidates, clears the field, then calls onSaved", async () => {
    stubFetch(200);
    const order: string[] = [];
    vi.mocked(invalidateAll).mockImplementation(async () => {
      order.push("invalidate");
    });
    const onSaved = vi.fn(() => order.push("saved"));
    render(CaptureForm, { variant: "inline", onSaved });
    const input = await type("https://example.com");
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(order).toEqual(["invalidate", "saved"]);
    expect(input.value).toBe("");
  });

  it.each([
    [402, CAPTURE_MESSAGES.quota],
    [500, CAPTURE_MESSAGES.rejected],
    [new TypeError("offline"), CAPTURE_MESSAGES.network],
  ])("on failure %s: keeps the url and shows the message", async (s, msg) => {
    stubFetch(s);
    const onSaved = vi.fn();
    render(CaptureForm, { variant: "sheet", onSaved });
    const input = await type("https://example.com");
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(input.value).toBe("https://example.com");
    expect(onSaved).not.toHaveBeenCalled();
    expect(invalidateAll).not.toHaveBeenCalled();
  });

  it("empty submit sends nothing and focuses the input", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(CaptureForm, { variant: "sheet" });
    await save();
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables Save with a spinner while busy", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (release = r))),
    );
    render(CaptureForm, { variant: "sheet" });
    await type("https://example.com");
    await save();
    const btn = await screen.findByRole("button", { name: "Save" });
    await waitFor(() => expect(btn).toBeDisabled());
    expect(screen.getByRole("status")).toBeInTheDocument();
    release(new Response(null, { status: 200 }));
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("inline variant: labelled url field, pill with trailing icon Save", () => {
    render(CaptureForm, { variant: "inline" });
    const input = screen.getByRole("textbox", { name: "Save a link" });
    expect(input).toHaveAttribute("type", "url");
    expect(input).toHaveAttribute("inputmode", "url");
    expect(input).toHaveAttribute("autocomplete", "off");
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className.split(/\s+/)).toContain("size-11");
    expect(btn).toHaveAttribute("type", "submit");
    expect(document.querySelector("[data-slot='input-group']")).not.toBeNull();
  });

  it("sheet variant: static placeholder and a plain Input", () => {
    render(CaptureForm, { variant: "sheet" });
    expect(screen.getByPlaceholderText("Paste a link")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='input-group']")).toBeNull();
  });

  it("success notifies captureSaved", async () => {
    stubFetch(200);
    const before = captureSaved.count;
    render(CaptureForm, { variant: "inline" });
    await type("https://example.com");
    await save();
    await waitFor(() => expect(captureSaved.count).toBe(before + 1));
  });

  it("a rejected invalidateAll still clears, notifies and calls onSaved", async () => {
    stubFetch(200);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invalidateAll).mockRejectedValueOnce(new Error("boom"));
    const before = captureSaved.count;
    const onSaved = vi.fn();
    render(CaptureForm, { variant: "sheet", onSaved });
    const input = await type("https://example.com");
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(input.value).toBe("");
    expect(captureSaved.count).toBe(before + 1);
  });

  it("url input carries mobile keyboard hints", () => {
    render(CaptureForm, { variant: "sheet" });
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("sheet variant autofocuses when asked", () => {
    render(CaptureForm, { variant: "sheet", autofocus: true });
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("submitting the form (Enter) saves", async () => {
    stubFetch(200);
    const onSaved = vi.fn();
    render(CaptureForm, { variant: "sheet", onSaved });
    await type("https://example.com");
    await fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
