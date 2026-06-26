import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XExtractor } from "./x-extractor.js";
import type { ExtractIO } from "./extractor.js";

const single = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../../packages/core/src/source/x/fixtures/single-tweet.json", import.meta.url)
    ),
    "utf8"
  )
);

function io(over: Partial<ExtractIO> = {}): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => single,
    runYtDlp: async () => { throw new Error("unused"); },
    ...over,
  };
}

describe("XExtractor", () => {
  it("declares source 'x'", () => {
    expect(new XExtractor().source).toBe("x");
  });

  it("fetches the syndication endpoint and parses the tweet", async () => {
    let requested = "";
    const res = await new XExtractor().extract(
      "https://x.com/jack/status/20",
      io({ fetchJson: async (url) => { requested = url; return single; } })
    );
    expect(requested).toContain("cdn.syndication.twimg.com");
    expect(requested).toContain("id=20");
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("x");
  });

  it("fails gracefully when the url has no tweet id", async () => {
    const res = await new XExtractor().extract("https://x.com/jack", io());
    expect(res.status).toBe("failed");
    expect(res.failureReason).toBe("not a tweet url");
  });

  it("strips script tags from contentHtml even if text contains them", async () => {
    const malicious = {
      ...single,
      text: "check this <script>alert(1)</script> out",
    };
    const res = await new XExtractor().extract(
      "https://x.com/jack/status/20",
      io({ fetchJson: async () => malicious })
    );
    expect(res.status).toBe("ok");
    expect(res.contentHtml).not.toContain("<script");
  });
});
