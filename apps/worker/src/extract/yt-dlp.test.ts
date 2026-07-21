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

  it("passes --cookies to yt-dlp when a cookies file is configured", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
      cookiesFile: "/run/secrets/yt-cookies.txt",
    });
    await run("dQw4w9WgXcQ");
    const i = execArgs.indexOf("--cookies");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(execArgs[i + 1]).toBe("/run/secrets/yt-cookies.txt");
  });

  it("omits --cookies when no cookies file is configured", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
    });
    await run("dQw4w9WgXcQ");
    expect(execArgs).not.toContain("--cookies");
  });

  it("passes the bgutil PO-token base_url via --extractor-args when configured", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
      potProviderUrl: "http://bgutil:4416",
    });
    await run("dQw4w9WgXcQ");
    const i = execArgs.indexOf("--extractor-args");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(execArgs[i + 1]).toBe("youtubepot-bgutilhttp:base_url=http://bgutil:4416");
  });

  it("omits --extractor-args when no PO-token provider is configured", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
    });
    await run("dQw4w9WgXcQ");
    expect(execArgs).not.toContain("--extractor-args");
  });

  it("returns null captions when no english track is present", async () => {
    const run = createRunYtDlp({
      exec: async () => JSON.stringify({ id: "x", title: "t", channel: null }),
      fetchText: async () => { throw new Error("should not fetch"); },
    });
    const out = await run("x");
    expect(out.captions).toBeNull();
  });

  it("matches a variant English key (en-US) when there is no exact 'en' track", async () => {
    const url = "https://youtube.com/api/timedtext?fmt=json3&lang=en-US";
    let fetchedUrl = "";
    const run = createRunYtDlp({
      exec: async () =>
        JSON.stringify({
          id: "kJQP7kiw5Fk",
          title: "t",
          subtitles: { "en-US": [{ ext: "json3", url }], ja: [{ ext: "json3", url: "x" }] },
        }),
      fetchText: async (u) => { fetchedUrl = u; return json3; },
    });
    const out = await run("kJQP7kiw5Fk");
    expect(fetchedUrl).toBe(url);
    expect(out.captions).not.toBeNull();
  });

  it("prefers an exact 'en' track over a variant like 'en-US'", async () => {
    const exact = "https://youtube.com/api/timedtext?fmt=json3&lang=en";
    let fetchedUrl = "";
    const run = createRunYtDlp({
      exec: async () =>
        JSON.stringify({
          id: "x",
          title: "t",
          subtitles: {
            "en-US": [{ ext: "json3", url: "https://youtube.com/variant" }],
            en: [{ ext: "json3", url: exact }],
          },
        }),
      fetchText: async (u) => { fetchedUrl = u; return json3; },
    });
    await run("x");
    expect(fetchedUrl).toBe(exact);
  });

  it("matches a variant English key in automatic_captions", async () => {
    const url = "https://youtube.com/api/timedtext?fmt=json3&lang=en-orig";
    let fetchedUrl = "";
    const run = createRunYtDlp({
      exec: async () =>
        JSON.stringify({
          id: "x",
          title: "t",
          automatic_captions: { "en-orig": [{ ext: "json3", url }] },
        }),
      fetchText: async (u) => { fetchedUrl = u; return json3; },
    });
    await run("x");
    expect(fetchedUrl).toBe(url);
  });

  it("prefers manual subtitles over automatic_captions when both are present", async () => {
    const manualUrl = "https://youtube.com/api/timedtext?fmt=json3&kind=manual";
    const autoUrl = "https://youtube.com/api/timedtext?fmt=json3&kind=asr";
    let fetchedUrl = "";

    const run = createRunYtDlp({
      exec: async () =>
        JSON.stringify({
          id: "dQw4w9WgXcQ",
          title: "t",
          subtitles: { en: [{ ext: "json3", url: manualUrl }] },
          automatic_captions: { en: [{ ext: "json3", url: autoUrl }] },
        }),
      fetchText: async (url) => {
        fetchedUrl = url;
        return json3;
      },
    });

    await run("dQw4w9WgXcQ");
    expect(fetchedUrl).toBe(manualUrl);
  });
});
