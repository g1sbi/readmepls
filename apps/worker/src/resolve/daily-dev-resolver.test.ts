import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DailyDevResolver } from "./daily-dev-resolver.js";
import type { ResolveIO } from "./resolver.js";

const POST_HTML = readFileSync(
  join(__dirname, "fixtures/daily-dev-post.html"),
  "utf8",
);

function io(opts: {
  html?: string;
  redirect?: string | null;
  onRedirect?: (u: string) => void;
}): ResolveIO {
  return {
    fetchHtml: async () => opts.html ?? POST_HTML,
    fetchJson: async () => {
      throw new Error("unused");
    },
    fetchRedirectTarget: async (u) => {
      opts.onRedirect?.(u);
      return opts.redirect ?? null;
    },
  };
}

describe("DailyDevResolver", () => {
  const r = new DailyDevResolver();

  it("resolves a post via the case-sensitive og:image id", async () => {
    let requested = "";
    const got = await r.resolve(
      "https://app.daily.dev/posts/happening-now-just-got-better-rzof7hogy",
      io({
        redirect: "https://example.com/the-real-article",
        onRedirect: (u) => {
          requested = u;
        },
      }),
    );

    expect(got).toBe("https://example.com/the-real-article");
    // Case preserved from og:image, NOT lowercased from the slug.
    expect(requested).toBe("https://api.daily.dev/r/RZoF7hogy");
  });

  it("finds og:image regardless of attribute order", async () => {
    const html = `<meta content="https://og.daily.dev/api/posts/AbC123" property="og:image" />`;
    let requested = "";
    await r.resolve(
      "https://daily.dev/posts/x",
      io({
        html,
        redirect: "https://example.com/a",
        onRedirect: (u) => {
          requested = u;
        },
      }),
    );
    expect(requested).toBe("https://api.daily.dev/r/AbC123");
  });

  it("returns null when the redirect yields no target", async () => {
    expect(
      await r.resolve("https://daily.dev/posts/x", io({ redirect: null })),
    ).toBeNull();
  });

  it("returns null when og:image is missing", async () => {
    expect(
      await r.resolve(
        "https://daily.dev/posts/x",
        io({ html: "<html><head></head></html>" }),
      ),
    ).toBeNull();
  });

  it("returns null when og:image is not a post image", async () => {
    const html = `<meta property="og:image" content="https://daily.dev/logo.png" />`;
    expect(
      await r.resolve("https://daily.dev/posts/x", io({ html })),
    ).toBeNull();
  });

  it("returns null for a non-post path", async () => {
    expect(
      await r.resolve(
        "https://daily.dev/blog",
        io({ redirect: "https://x.com/a" }),
      ),
    ).toBeNull();
  });
});
