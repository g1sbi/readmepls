import { describe, it, expect } from "vitest";
import { ResolverRegistry, normalizeHost } from "./registry.js";
import type { LinkResolver, ResolveIO } from "./resolver.js";

const IO: ResolveIO = {
  fetchHtml: async () => {
    throw new Error("unused");
  },
  fetchJson: async () => {
    throw new Error("unused");
  },
  fetchRedirectTarget: async () => {
    throw new Error("unused");
  },
};

function stub(hosts: string[], target: string | null): LinkResolver {
  return { hosts, resolve: async () => target };
}

function throwingStub(hosts: string[]): LinkResolver {
  return {
    hosts,
    resolve: async () => {
      throw new Error("network down");
    },
  };
}

describe("normalizeHost", () => {
  it("lowercases and strips a leading www.", () => {
    expect(normalizeHost("WWW.Lobste.rs")).toBe("lobste.rs");
    expect(normalizeHost("news.ycombinator.com")).toBe("news.ycombinator.com");
  });
});

describe("ResolverRegistry", () => {
  it("returns null for an unclaimed host without performing IO", async () => {
    let touched = false;
    const io: ResolveIO = {
      fetchHtml: async () => {
        touched = true;
        return "";
      },
      fetchJson: async () => {
        touched = true;
        return {};
      },
      fetchRedirectTarget: async () => {
        touched = true;
        return null;
      },
    };
    const reg = new ResolverRegistry([
      stub(["daily.dev"], "https://example.com/a"),
    ]);

    expect(await reg.resolve("https://some-blog.com/post", io)).toBeNull();
    expect(touched).toBe(false);
  });

  it("dispatches to the resolver claiming the host", async () => {
    const reg = new ResolverRegistry([
      stub(["lobste.rs"], "https://example.com/a"),
    ]);
    expect(await reg.resolve("https://lobste.rs/s/abc123", IO)).toBe(
      "https://example.com/a",
    );
  });

  it("matches ignoring www. and case", async () => {
    const reg = new ResolverRegistry([
      stub(["lobste.rs"], "https://example.com/a"),
    ]);
    expect(await reg.resolve("https://WWW.Lobste.rs/s/abc", IO)).toBe(
      "https://example.com/a",
    );
  });

  it("returns null when the target maps back to the same resolver", async () => {
    // daily.dev natives: app.daily.dev → daily.dev is still daily.dev.
    const reg = new ResolverRegistry([
      stub(
        ["daily.dev", "app.daily.dev"],
        "https://daily.dev/posts/announcement-x",
      ),
    ]);
    expect(
      await reg.resolve("https://app.daily.dev/posts/announcement-x", IO),
    ).toBeNull();
  });

  it("returns null when the resolver throws", async () => {
    const reg = new ResolverRegistry([throwingStub(["daily.dev"])]);
    expect(await reg.resolve("https://daily.dev/posts/x", IO)).toBeNull();
  });

  it("returns null when the resolver finds no target", async () => {
    const reg = new ResolverRegistry([stub(["news.ycombinator.com"], null)]);
    expect(
      await reg.resolve("https://news.ycombinator.com/item?id=1", IO),
    ).toBeNull();
  });

  it("returns null for an unparseable input url", async () => {
    const reg = new ResolverRegistry([
      stub(["daily.dev"], "https://example.com/a"),
    ]);
    expect(await reg.resolve("not a url", IO)).toBeNull();
  });

  it("returns null when the resolver yields a non-http target", async () => {
    const reg = new ResolverRegistry([
      stub(["daily.dev"], "javascript:alert(1)"),
    ]);
    expect(await reg.resolve("https://daily.dev/posts/x", IO)).toBeNull();
  });

  it("canonicalizes the resolved target, stripping tracking params", async () => {
    // Matches a daily.dev /r/ redirect target carrying ?ref=...
    const reg = new ResolverRegistry([
      stub(
        ["daily.dev"],
        "https://Example.com/post?ref=daily.dev&utm_source=x",
      ),
    ]);
    expect(await reg.resolve("https://daily.dev/posts/x", IO)).toBe(
      "https://example.com/post",
    );
  });
});
