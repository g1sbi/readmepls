import { describe, it, expect, vi } from "vitest";
import { login, getValidToken, type PbClient } from "./auth.js";

function fakePb(opts: {
  refresh?: "ok" | "throw";
  loginToken?: string;
}): PbClient {
  let valid = false;
  let token = "";
  return {
    authStore: {
      get token() {
        return token;
      },
      get isValid() {
        return valid;
      },
      save: (t: string) => {
        token = t;
        valid = true;
      },
      clear: () => {
        token = "";
        valid = false;
      },
    },
    collection: () => ({
      authWithPassword: vi.fn(async () => {
        token = opts.loginToken ?? "logged-in";
        valid = true;
        return { token };
      }),
      authRefresh: vi.fn(async () => {
        if (opts.refresh === "throw") {
          valid = false;
          token = "";
          throw new Error("401");
        }
        valid = true;
        return {};
      }),
    }),
  };
}

describe("login", () => {
  it("authenticates and returns the token", async () => {
    const pb = fakePb({ loginToken: "jwt123" });
    expect(await login(pb, "a@b.c", "pw")).toBe("jwt123");
  });
});

describe("getValidToken", () => {
  it("returns the token when refresh succeeds", async () => {
    const pb = fakePb({ refresh: "ok" });
    expect(await getValidToken(pb, "stored-jwt")).toBe("stored-jwt");
  });
  it("returns null when refresh fails", async () => {
    const pb = fakePb({ refresh: "throw" });
    expect(await getValidToken(pb, "stale-jwt")).toBeNull();
  });
  it("returns null for an empty stored token", async () => {
    const pb = fakePb({ refresh: "ok" });
    expect(await getValidToken(pb, "")).toBeNull();
  });
});
