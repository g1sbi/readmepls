import { describe, it, expect } from "vitest";
import { validateCredentials } from "./validate.js";

describe("validateCredentials", () => {
  it("rejects an invalid email", () => {
    expect(validateCredentials("nope", "password12")).toMatch(/email/i);
  });
  it("rejects a short password", () => {
    expect(validateCredentials("a@b.com", "short")).toMatch(/password/i);
  });
  it("accepts valid credentials", () => {
    expect(validateCredentials("a@b.com", "password12")).toBeNull();
  });
});
