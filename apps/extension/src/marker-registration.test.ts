import { describe, it, expect, vi } from "vitest";
import {
  buildMarkerRegistration,
  syncMarkerRegistration,
  MARKER_ID,
  type ScriptingLike,
  type PermissionsLike,
} from "./marker-registration.js";
import { DEFAULT_INSTANCE_URL } from "./config.js";

describe("buildMarkerRegistration", () => {
  it("returns null for the default SaaS instance (static script covers it)", () => {
    expect(buildMarkerRegistration(DEFAULT_INSTANCE_URL)).toBeNull();
  });

  it("returns null for an invalid url", () => {
    expect(buildMarkerRegistration("not a url")).toBeNull();
  });

  it("builds an origin-scoped registration for a custom instance", () => {
    expect(buildMarkerRegistration("https://read.example.com/app")).toEqual({
      id: MARKER_ID,
      matches: ["https://read.example.com/*"],
      js: ["content-marker.js"],
      runAt: "document_start",
    });
  });
});

function fakeScripting() {
  return {
    registerContentScripts: vi.fn(async () => {}),
    unregisterContentScripts: vi.fn(async () => {}),
  } satisfies ScriptingLike;
}

describe("syncMarkerRegistration", () => {
  it("registers for a custom instance when permission is granted", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => true) };
    await syncMarkerRegistration(
      scripting,
      permissions,
      "https://read.example.com",
    );
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [MARKER_ID],
    });
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: MARKER_ID,
        matches: ["https://read.example.com/*"],
        js: ["content-marker.js"],
        runAt: "document_start",
      },
    ]);
  });

  it("skips registration when permission is not granted", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => false) };
    await syncMarkerRegistration(
      scripting,
      permissions,
      "https://read.example.com",
    );
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it("only clears (never registers) for the default instance", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => true) };
    await syncMarkerRegistration(scripting, permissions, DEFAULT_INSTANCE_URL);
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [MARKER_ID],
    });
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
