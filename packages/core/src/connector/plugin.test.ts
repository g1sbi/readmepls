import { describe, it, expect } from "vitest";
import { NotImplementedError } from "./plugin.js";

describe("NotImplementedError", () => {
  it("names the connector and is an Error", () => {
    const e = new NotImplementedError("notion");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NotImplementedError");
    expect(e.message).toContain("notion");
  });
});
