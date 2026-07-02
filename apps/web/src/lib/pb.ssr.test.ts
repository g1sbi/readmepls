// @vitest-environment node
import { describe, it, expect } from "vitest";
import { browserPb } from "./pb.js";

// The root layout constructs the browser PocketBase client in its component
// script, which also runs during server-side rendering. On the server there is
// no `document`, so touching `document.cookie` throws "document is not defined"
// and breaks every server render. browserPb() must be SSR-safe.
describe("browserPb during SSR", () => {
  it("does not throw when document is undefined", () => {
    expect(typeof document).toBe("undefined");
    expect(() => browserPb()).not.toThrow();
  });
});
