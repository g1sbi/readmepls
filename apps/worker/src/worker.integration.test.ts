import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { classifySource } from "@readmepls/core";
import { processJob } from "./worker.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { NullAIProvider } from "./ai/null-provider.js";
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

const registry = new ExtractorRegistry([new ArticleExtractor()]);
function ioWith(htmlBody: string): ExtractIO {
  return {
    fetchHtml: async () => htmlBody,
    fetchJson: async () => { throw new Error("fetchJson not used in this test"); },
    runYtDlp: async () => { throw new Error("runYtDlp not used in this test"); },
  };
}

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
      io: ioWith(html),
      registry,
      ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
      classify: classifySource,
      fetchBytes: async () => null,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");
    expect(done.content).toBeTruthy();

    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.title).toBe("Hello World Article");
    expect(content.extract_status).toBe("ok");
    expect(content.ai_tags_json).toEqual(["hello"]);
  });

  it("records the field-level reason when the content write is rejected", async () => {
    // A duplicate canonical_url collides with content's unique index. The bare
    // PocketBase message is "Failed to create record." — useless for diagnosis.
    // last_error must carry the field-level detail so a stuck job is debuggable.
    const url = "https://example.com/dup-content";
    await h.pb.collection("content").create({
      canonical_url: url,
      content_hash: "preexisting",
      source_type: "article",
      extract_status: "ok",
    });
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: url,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      io: ioWith(html),
      registry,
      ai: new MockAIProvider({ tags: ["x"], summary: "s" }),
      classify: classifySource,
      fetchBytes: async () => null,
    });

    const after = await h.pb.collection("jobs").getOne(job.id);
    expect(after.status).toBe("failed");
    expect(after.last_error).toContain("canonical_url");
    expect(after.last_error).toContain("validation_not_unique");
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
      io: ioWith("<html></html>"),
      registry,
      ai: new MockAIProvider(),
      classify: classifySource,
      fetchBytes: async () => null,
    });

    const after = await h.pb.collection("jobs").getOne(job.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(1);
  });

  it("completes extraction with empty tags/summary when no AI provider is configured", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://example.com/no-ai",
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      io: ioWith(html),
      registry,
      ai: new NullAIProvider(),
      classify: classifySource,
      fetchBytes: async () => null,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");

    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.ai_tags_json).toEqual([]);
    // excerpt falls back to the extractor's own excerpt, not an AI summary,
    // since ai.summary is "" (falsy) — worker.ts:44 `ai.summary || result.excerpt`.
    expect(content.excerpt).toBeTruthy();
    expect(content.title).toBe("Hello World Article");
  });
});
