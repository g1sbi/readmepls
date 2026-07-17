import { describe, it, expect, vi } from "vitest";
import { parseBearer, resolvePbAuth, type PbLike } from "./api-auth.js";

describe("parseBearer", () => {
  it("extracts the token", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns null for missing/malformed headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Basic xyz")).toBeNull();
  });
});

/** Fake PB whose validity is scripted per authRefresh call. */
function fakePb(opts: {
  cookieValid?: boolean;
  refreshOutcome?: "ok" | "throw";
  id?: string;
}): PbLike {
  let valid = !!opts.cookieValid;
  let model: { id?: string } | null = opts.cookieValid
    ? { id: opts.id ?? "u1" }
    : null;
  return {
    authStore: {
      loadFromCookie: vi.fn(),
      save: vi.fn((_t: string) => {
        valid = true;
      }),
      clear: vi.fn(() => {
        valid = false;
        model = null;
      }),
      get isValid() {
        return valid;
      },
      get token() {
        return "tok";
      },
      get model() {
        return model;
      },
    },
    collection: () => ({
      authRefresh: vi.fn(async () => {
        if (opts.refreshOutcome === "throw") {
          valid = false;
          model = null;
          throw new Error("401");
        }
        valid = true;
        model = { id: opts.id ?? "u1" };
        return {};
      }),
    }),
  } as unknown as PbLike;
}

describe("resolvePbAuth", () => {
  it("authenticates via a valid cookie (viaBearer false)", async () => {
    const pb = fakePb({ cookieValid: true, refreshOutcome: "ok" });
    const r = await resolvePbAuth(pb, "pb_auth=x", null);
    expect(r).toEqual({ userId: "u1", viaBearer: false });
  });

  it("falls back to a valid bearer token (viaBearer true)", async () => {
    const pb = fakePb({ cookieValid: false, refreshOutcome: "ok", id: "u9" });
    const r = await resolvePbAuth(pb, "", "Bearer jwt");
    expect(r).toEqual({ userId: "u9", viaBearer: true });
  });

  it("returns null when the bearer token is rejected", async () => {
    const pb = fakePb({ cookieValid: false, refreshOutcome: "throw" });
    const r = await resolvePbAuth(pb, "", "Bearer bad");
    expect(r).toEqual({ userId: null, viaBearer: false });
  });

  it("returns null with no cookie and no bearer", async () => {
    const pb = fakePb({ cookieValid: false });
    const r = await resolvePbAuth(pb, "", null);
    expect(r).toEqual({ userId: null, viaBearer: false });
  });
});
