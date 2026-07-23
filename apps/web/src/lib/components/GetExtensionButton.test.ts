import { describe, it, expect, beforeEach } from "vitest";
import { tick } from "svelte";
import { render, screen, fireEvent } from "@testing-library/svelte";
import GetExtensionButton from "./GetExtensionButton.svelte";
import {
  initExtensionDetection,
  resetExtensionDetection,
} from "$lib/stores/extension.svelte.js";
import { EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("GetExtensionButton", () => {
  it("renders when the extension is not installed", () => {
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();
  });

  it("opens the pitch dialog when clicked", async () => {
    render(GetExtensionButton);
    await fireEvent.click(
      screen.getByRole("button", { name: /get the extension/i }),
    );
    expect(
      screen.getByRole("link", { name: /chrome extension/i }),
    ).toBeInTheDocument();
  });

  it("hides the button once the extension is detected", async () => {
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent(EXTENSION_READY_EVENT));
    await tick();

    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });
});
