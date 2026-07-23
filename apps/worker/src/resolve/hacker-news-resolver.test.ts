import { describe, it, expect } from "vitest";
import { HackerNewsResolver } from "./hacker-news-resolver.js";
import type { ResolveIO } from "./resolver.js";

// Shape trimmed from the real Firebase v0 item response.
const LINK_ITEM = {
  id: 8863,
  type: "story",
  by: "dhouston",
  title: "My YC app: Dropbox",
  url: "https://www.getdropbox.com/u/2/screencast.html",
};

const TEXT_ITEM = {
  id: 121003,
  type: "story",
  by: "tel",
  title: "Ask HN: The Arc Effect",
  text: "<i>or</i> HN: the Next Iteration",
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

describe("HackerNewsResolver", () => {
  const r = new HackerNewsResolver();

  it("resolves an item to its linked url", async () => {
    let requested = "";
    const got = await r.resolve(
      "https://news.ycombinator.com/item?id=8863",
      io(LINK_ITEM, (u) => {
        requested = u;
      }),
    );
    expect(got).toBe("https://www.getdropbox.com/u/2/screencast.html");
    expect(requested).toBe(
      "https://hacker-news.firebaseio.com/v0/item/8863.json",
    );
  });

  it("returns null for a text post with no url", async () => {
    expect(
      await r.resolve(
        "https://news.ycombinator.com/item?id=121003",
        io(TEXT_ITEM),
      ),
    ).toBeNull();
  });

  it("returns null for a deleted item (null response)", async () => {
    expect(
      await r.resolve("https://news.ycombinator.com/item?id=1", io(null)),
    ).toBeNull();
  });

  it("returns null for a malformed response", async () => {
    expect(
      await r.resolve(
        "https://news.ycombinator.com/item?id=1",
        io({ url: 42 }),
      ),
    ).toBeNull();
  });

  it("returns null when the path is not an item page", async () => {
    expect(
      await r.resolve("https://news.ycombinator.com/newest", io(LINK_ITEM)),
    ).toBeNull();
  });

  it("returns null for a non-numeric id", async () => {
    expect(
      await r.resolve(
        "https://news.ycombinator.com/item?id=abc",
        io(LINK_ITEM),
      ),
    ).toBeNull();
  });
});
