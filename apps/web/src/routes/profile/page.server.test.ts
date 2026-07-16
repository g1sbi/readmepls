import { describe, it, expect } from "vitest";
import { isRedirect } from "@sveltejs/kit";
import { load } from "./+page.server.js";

describe("/profile load", () => {
  it("redirects to /library (route temporarily disabled)", async () => {
    try {
      // @ts-expect-error - minimal event stub, load doesn't use it
      await load({});
      expect.unreachable("expected redirect to throw");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { location: string }).location).toBe("/library");
    }
  });
});
