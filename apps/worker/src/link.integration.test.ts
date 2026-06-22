import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
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

describe("processJob article linking", () => {
  it("links every content-less article that shares the job's canonical_url", async () => {
    const u1 = await makeTestUser(h.pb);
    const u2 = await makeTestUser(h.pb);
    const url = "https://example.com/post";

    const mk = (user: string) =>
      h.pb.collection("articles").create({
        user, url, canonical_url: url, status: "unread", progress: 0, is_private: true,
      });
    const a1 = await mk(u1);
    const a2 = await mk(u2);

    const job = await h.pb.collection("jobs").create({
      user: u1, canonical_url: url, type: "extract", status: "running", attempts: 0,
    });

    await processJob(h.pb, job.id, {
      fetchHtml: async () => html,
      extractor: new ArticleExtractor(),
      ai: new MockAIProvider({ tags: ["t"], summary: "s" }),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    const got1 = await h.pb.collection("articles").getOne(a1.id);
    const got2 = await h.pb.collection("articles").getOne(a2.id);
    expect(got1.content).toBe(done.content);
    expect(got2.content).toBe(done.content);
    expect(got1.is_private).toBe(false);
    expect(got2.is_private).toBe(false);
  });
});
