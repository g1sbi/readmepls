import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseJson3Captions, parseYtTranscript } from "./transcript.js";
import type { YtMeta } from "./transcript.js";
import { ExtractResult } from "@readmepls/types";

const json3 = readFileSync(
  fileURLToPath(new URL("./fixtures/captions.json3.json", import.meta.url)),
  "utf8"
);

const meta: YtMeta = {
  videoId: "dQw4w9WgXcQ",
  title: "A Talk About Extraction",
  channel: "Reader Channel",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  description: "An overview of content extraction.",
};

describe("parseJson3Captions", () => {
  it("collapses segs into timestamped cues, dropping blank events", () => {
    const caps = parseJson3Captions(json3);
    expect(caps).not.toBeNull();
    expect(caps!.cues).toHaveLength(3);
    expect(caps!.cues[0]).toEqual({ startSec: 0, text: "hello and welcome" });
  });
  it("returns null for non-json3 input", () => {
    expect(parseJson3Captions("not json")).toBeNull();
    expect(parseJson3Captions('{"events":[]}')).toBeNull();
  });
});

describe("parseYtTranscript", () => {
  it("produces a schema-valid ok result with transcript text", () => {
    const res = parseYtTranscript(meta, parseJson3Captions(json3));
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("youtube");
    expect(res.title).toBe("A Talk About Extraction");
    expect(res.author).toBe("Reader Channel");
    expect(res.heroImage).toContain("hqdefault.jpg");
    expect(res.contentText).toContain("hello and welcome");
    expect(res.contentText).toContain("let's begin");
  });

  it("degrades to partial with the description when no captions exist", () => {
    const res = parseYtTranscript(meta, null);
    expect(res.status).toBe("partial");
    expect(res.failureReason).toBe("no transcript");
    expect(res.contentText).toContain("overview of content extraction");
  });
});
