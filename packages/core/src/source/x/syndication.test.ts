import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSyndicationThread } from "./syndication.js";
import { ExtractResult } from "@readmepls/types";

const load = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8")
  );

describe("parseSyndicationThread", () => {
  it("renders a single tweet as a schema-valid ok result", () => {
    const res = parseSyndicationThread(load("single-tweet.json"));
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("x");
    expect(res.author).toContain("@jack");
    expect(res.contentText).toContain("just setting up my twttr");
    expect(res.heroImage).toBe("https://pbs.twimg.com/media/abc.jpg");
    expect(res.contentHtml).not.toContain("<script");
  });

  it("includes the quoted tweet in the rendered content", () => {
    const res = parseSyndicationThread(load("thread-with-quote.json"));
    expect(res.status).toBe("ok");
    expect(res.contentText).toContain("a thought about extraction");
    expect(res.contentText).toContain("the original claim");
  });

  it("returns a failed result for an unavailable/tombstoned tweet", () => {
    const res = parseSyndicationThread(load("unavailable.json"));
    expect(res.status).toBe("failed");
    expect(res.sourceType).toBe("x");
    expect(res.failureReason).toBe("tweet unavailable");
  });

  it("returns a failed result for unexpected shapes", () => {
    expect(parseSyndicationThread({ nope: true }).status).toBe("failed");
  });
});
