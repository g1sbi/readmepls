import { describe, it, expect } from "vitest";
import { routeGuard } from "./auth.js";

describe("routeGuard", () => {
  it("redirects unauthenticated users away from protected pages", () => {
    expect(routeGuard("/", null, false, false)).toBe("/login");
    expect(routeGuard("/read/abc", null, false, false)).toBe("/login");
  });
  it("allows verified users through", () => {
    expect(routeGuard("/", "u1", true, false)).toBeNull();
    expect(routeGuard("/read/abc", "u1", true, false)).toBeNull();
  });
  it("never redirects login, verify, or api routes", () => {
    expect(routeGuard("/login", null, false, false)).toBeNull();
    expect(routeGuard("/verify", null, false, false)).toBeNull();
    expect(routeGuard("/api/capture", null, false, false)).toBeNull();
  });
  it("redirects an authenticated but unverified SaaS user to /verify", () => {
    expect(routeGuard("/", "u1", false, false)).toBe("/verify");
    expect(routeGuard("/read/abc", "u1", false, false)).toBe("/verify");
  });
  it("does not gate on verification when self-hosted", () => {
    expect(routeGuard("/", "u1", false, true)).toBeNull();
  });
});
