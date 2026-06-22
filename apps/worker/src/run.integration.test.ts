import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { runWorkerOnce } from "./run.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";

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

const deps = () => ({
  fetchHtml: async () => html,
  extractor: new ArticleExtractor(),
  ai: new MockAIProvider({ tags: ["t"], summary: "s" }),
  classify: classifySource,
});

describe("runWorkerOnce", () => {
  it("returns false when the queue is empty", async () => {
    expect(await runWorkerOnce(h.pb, "w1", deps())).toBe(false);
  });

  it("claims and processes one queued job, returning true", async () => {
    await handleCapture(h.pb, userId, "https://example.com/post");
    expect(await runWorkerOnce(h.pb, "w1", deps())).toBe(true);
    const job = await h.pb.collection("jobs").getFirstListItem(`canonical_url = "https://example.com/post"`);
    expect(job.status).toBe("done");
  });
});
