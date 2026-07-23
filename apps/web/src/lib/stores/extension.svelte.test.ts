import { describe, it, expect, beforeEach } from "vitest";
import {
  extensionStore,
  initExtensionDetection,
  resetExtensionDetection,
} from "./extension.svelte.js";

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
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    initExtensionDetection();
    expect(extensionStore.installed).toBe(true);
  });
});
