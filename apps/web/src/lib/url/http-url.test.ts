import { describe, it, expect } from "vitest";
import { httpUrlOrNull } from "./http-url.js";

describe("httpUrlOrNull", () => {
  it("returns http and https URLs unchanged", () => {
    expect(httpUrlOrNull("https://example.com/p")).toBe("https://example.com/p");
    expect(httpUrlOrNull("http://example.com/x")).toBe("http://example.com/x");
  });
  it("rejects javascript: and data: schemes", () => {
    expect(httpUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpUrlOrNull("data:text/html,x")).toBeNull();
  });
  it("rejects unparseable input", () => {
    expect(httpUrlOrNull("not a url")).toBeNull();
    expect(httpUrlOrNull("")).toBeNull();
  });
});
