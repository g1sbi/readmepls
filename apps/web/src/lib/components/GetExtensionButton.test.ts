import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import GetExtensionButton from "./GetExtensionButton.svelte";
import {
  initExtensionDetection,
  resetExtensionDetection,
} from "$lib/stores/extension.svelte.js";

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
  page.set({ ...basePageValue, data: { selfHosted: false } });
});

describe("GetExtensionButton", () => {
  it("renders on SaaS when the extension is not installed", () => {
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();
  });

  it("opens the pitch dialog when clicked", async () => {
    initExtensionDetection();
    render(GetExtensionButton);
    await fireEvent.click(
      screen.getByRole("button", { name: /get the extension/i }),
    );
    expect(
      screen.getByRole("link", { name: /chrome extension/i }),
    ).toBeInTheDocument();
  });

  it("hides the button once the extension is detected", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });

  it("never renders on a self-hosted instance, even when not installed", () => {
    page.set({ ...basePageValue, data: { selfHosted: true } });
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });
});
