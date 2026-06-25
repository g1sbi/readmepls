import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { YoutubeExtractor } from "./youtube-extractor.js";
import { parseJson3Captions } from "@readmepls/core";
import type { ExtractIO } from "./extractor.js";
import type { YtDlpOutput } from "@readmepls/core";

const json3 = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/core/src/source/youtube/fixtures/captions.json3.json", import.meta.url)
  ),
  "utf8"
);

const out: YtDlpOutput = {
  meta: {
    videoId: "dQw4w9WgXcQ",
    title: "A Talk About Extraction",
    channel: "Reader Channel",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    description: "An overview.",
  },
  captions: parseJson3Captions(json3),
};

function io(over: Partial<ExtractIO> = {}): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => out,
    ...over,
  };
}

describe("YoutubeExtractor", () => {
  it("declares source 'youtube'", () => {
    expect(new YoutubeExtractor().source).toBe("youtube");
  });

  it("runs yt-dlp for the video id and parses the transcript", async () => {
    let askedId = "";
    const res = await new YoutubeExtractor().extract(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      io({ runYtDlp: async (id) => { askedId = id; return out; } })
    );
    expect(askedId).toBe("dQw4w9WgXcQ");
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("youtube");
    expect(res.contentText).toContain("hello and welcome");
  });

  it("fails gracefully for non-video urls", async () => {
    const res = await new YoutubeExtractor().extract("https://www.youtube.com/feed", io());
    expect(res.status).toBe("failed");
    expect(res.failureReason).toBe("not a youtube video url");
  });
});
