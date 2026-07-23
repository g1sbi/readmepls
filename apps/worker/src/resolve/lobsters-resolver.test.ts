import { describe, it, expect } from "vitest";
import { LobstersResolver } from "./lobsters-resolver.js";
import type { ResolveIO } from "./resolver.js";

const LINK_STORY = {
  short_id: "abc123",
  title: "A great post",
  url: "https://example.com/a-great-post",
};

// Text-only submissions carry an empty string, not a missing field.
const TEXT_STORY = {
  short_id: "xyz789",
  title: "Ask: what do you use?",
  url: "",
};

function io(json: unknown, onUrl?: (u: string) => void): ResolveIO {
  return {
    fetchHtml: async () => {
      throw new Error("unused");
    },
    fetchJson: async (u) => {
      onUrl?.(u);
      return json;
    },
    fetchRedirectTarget: async () => {
      throw new Error("unused");
    },
  };
}

describe("LobstersResolver", () => {
  const r = new LobstersResolver();

  it("resolves a story to its linked url", async () => {
    let requested = "";
    const got = await r.resolve(
      "https://lobste.rs/s/abc123/a-great-post",
      io(LINK_STORY, (u) => {
        requested = u;
      }),
    );
    expect(got).toBe("https://example.com/a-great-post");
    expect(requested).toBe("https://lobste.rs/s/abc123.json");
  });

  it("returns null for a text-only story with an empty url", async () => {
    expect(
      await r.resolve("https://lobste.rs/s/xyz789", io(TEXT_STORY)),
    ).toBeNull();
  });

  it("returns null for a malformed response", async () => {
    expect(
      await r.resolve("https://lobste.rs/s/abc123", io({ url: 42 })),
    ).toBeNull();
  });

  it("returns null when the path is not a story page", async () => {
    expect(
      await r.resolve("https://lobste.rs/recent", io(LINK_STORY)),
    ).toBeNull();
  });

  it("returns null for a deleted story (null response)", async () => {
    expect(await r.resolve("https://lobste.rs/s/abc123", io(null))).toBeNull();
  });

  it("returns null for an invalid short_id format", async () => {
    let fetchCalled = false;
    await r.resolve(
      "https://lobste.rs/s/@invalid",
      io(LINK_STORY, () => {
        fetchCalled = true;
      }),
    );
    expect(fetchCalled).toBe(false);
  });
});
