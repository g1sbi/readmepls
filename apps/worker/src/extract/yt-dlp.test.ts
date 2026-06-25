import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRunYtDlp } from "./yt-dlp.js";

const json3 = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/core/src/source/youtube/fixtures/captions.json3.json", import.meta.url)
  ),
  "utf8"
);

// yt-dlp -j output: metadata with an automatic_captions json3 track url.
const ytDlpJson = JSON.stringify({
  id: "dQw4w9WgXcQ",
  title: "A Talk About Extraction",
  channel: "Reader Channel",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  description: "An overview.",
  automatic_captions: {
    en: [{ ext: "json3", url: "https://youtube.com/api/timedtext?fmt=json3" }],
  },
});

describe("createRunYtDlp", () => {
  it("invokes yt-dlp, fetches the json3 caption track, returns parsed output", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
    });

    const out = await run("dQw4w9WgXcQ");
    expect(execArgs).toContain("-j");
    expect(execArgs.some((a) => a.includes("dQw4w9WgXcQ"))).toBe(true);
    expect(out.meta.title).toBe("A Talk About Extraction");
    expect(out.meta.channel).toBe("Reader Channel");
    expect(out.captions).not.toBeNull();
    expect(out.captions!.cues[0]!.text).toBe("hello and welcome");
  });

  it("returns null captions when no english track is present", async () => {
    const run = createRunYtDlp({
      exec: async () => JSON.stringify({ id: "x", title: "t", channel: null }),
      fetchText: async () => { throw new Error("should not fetch"); },
    });
    const out = await run("x");
    expect(out.captions).toBeNull();
  });
});
