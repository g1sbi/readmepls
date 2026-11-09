import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { signOut } from "./sign-out.js";

describe("signOut", () => {
  it("clears the auth store, then navigates to /login", async () => {
    const order: string[] = [];
    const pb = {
      authStore: { clear: vi.fn(() => order.push("clear")) },
    } as unknown as PocketBase;
    const go = vi.fn(async (_p: string) => {
      order.push("go");
    });
    await signOut(pb, go);
    expect(order).toEqual(["clear", "go"]);
    expect(go).toHaveBeenCalledWith("/login");
  });
});
