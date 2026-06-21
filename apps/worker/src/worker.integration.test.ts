import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { classifySource } from "@readmepls/core";
import { processJob } from "./worker.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("processJob", () => {
  it("extracts, tags, writes content, and marks job done", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://example.com/post",
      type: "extract",
      status: "running",
      attempts: 0,
      locked_by: "worker-A",
      locked_at: new Date().toISOString(),
    });

    await processJob(h.pb, job.id, {
      fetchHtml: async () => html,
      extractor: new ArticleExtractor(),
      ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");
    expect(done.content).toBeTruthy();

    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.title).toBe("Hello World Article");
    expect(content.extract_status).toBe("ok");
    expect(content.ai_tags_json).toEqual(["hello"]);
  });

  it("marks job failed and increments attempts when extraction fails", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://example.com/empty",
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      fetchHtml: async () => "<html></html>",
      extractor: new ArticleExtractor(),
      ai: new MockAIProvider(),
      classify: classifySource,
    });

    const after = await h.pb.collection("jobs").getOne(job.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(1);
  });
});
