import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { runLoopOnce } from "./run-loop.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

const deps = {
  fetchHtml: async () => html,
  extractor: new ArticleExtractor(),
  ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
  classify: classifySource,
};

describe("runLoopOnce", () => {
  it("returns false when no jobs are queued", async () => {
    const worked = await runLoopOnce(h.pb, "worker-A", deps);
    expect(worked).toBe(false);
  });

  it("claims and processes one queued job, returns true", async () => {
    await handleCapture(h.pb, userId, "https://example.com/loop-once");
    const worked = await runLoopOnce(h.pb, "worker-A", deps);
    expect(worked).toBe(true);
    const job = await h.pb.collection("jobs").getFirstListItem(
      'canonical_url = "https://example.com/loop-once"'
    );
    expect(job.status).toBe("done");
  });
});
