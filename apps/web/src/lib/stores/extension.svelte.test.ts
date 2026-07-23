import { describe, it, expect, beforeEach } from "vitest";
import {
  extensionStore,
  initExtensionDetection,
  resetExtensionDetection,
} from "./extension.svelte.js";
import { EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("extensionStore", () => {
  it("starts not installed", () => {
    initExtensionDetection();
    expect(extensionStore.installed).toBe(false);
  });

  it("detects a marker already present at init", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.0";
    initExtensionDetection();
    expect(extensionStore.installed).toBe(true);
  });

  it("flips to installed on the ready event", () => {
    initExtensionDetection();
    expect(extensionStore.installed).toBe(false);
    window.dispatchEvent(new CustomEvent(EXTENSION_READY_EVENT));
    expect(extensionStore.installed).toBe(true);
  });
});
