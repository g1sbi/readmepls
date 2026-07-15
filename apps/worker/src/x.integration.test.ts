import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { classifySource } from "@readmepls/core";
import { processJob } from "./worker.js";
import { ExtractorRegistry } from "./extract/registry.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { XExtractor } from "./extract/x-extractor.js";
import type { ExtractIO } from "./extract/extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { FakeEmbedder } from "./embed/fake-embedder.js";

const tweet = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../packages/core/src/source/x/fixtures/single-tweet.json", import.meta.url)
    ),
    "utf8"
  )
);

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

describe("processJob routes X urls to the X extractor", () => {
  it("writes an x content row from the syndication fixture", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://x.com/jack/status/20",
      type: "extract",
      status: "running",
      attempts: 0,
    });

    const io: ExtractIO = {
      fetchHtml: async () => { throw new Error("unused"); },
      fetchJson: async () => tweet,
      runYtDlp: async () => { throw new Error("unused"); },
    };

    await processJob(h.pb, job.id, {
      io,
      registry: new ExtractorRegistry([new ArticleExtractor(), new XExtractor()]),
      ai: new MockAIProvider({ tags: ["x"], summary: "tweet." }),
      classify: classifySource,
      fetchBytes: async () => null,
      embedder: new FakeEmbedder(),
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");
    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.source_type).toBe("x");
    expect(content.content_text).toContain("just setting up my twttr");
  });
});
