import { describe, it, expect } from "vitest";
import { routeGuard } from "./auth.js";

describe("routeGuard", () => {
  it("redirects unauthenticated users away from protected pages", () => {
    expect(routeGuard("/", null)).toBe("/login");
    expect(routeGuard("/read/abc", null)).toBe("/login");
  });
  it("allows authenticated users through", () => {
    expect(routeGuard("/", "u1")).toBeNull();
    expect(routeGuard("/read/abc", "u1")).toBeNull();
  });
  it("never redirects the login page or api routes", () => {
    expect(routeGuard("/login", null)).toBeNull();
    expect(routeGuard("/api/capture", null)).toBeNull();
  });
});
