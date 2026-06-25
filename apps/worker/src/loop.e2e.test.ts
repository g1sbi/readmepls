import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { claimNextJob } from "./jobs/claim.js";
import { processJob } from "./worker.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";

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

const registry = new ExtractorRegistry([new ArticleExtractor()]);
const io: ExtractIO = {
  fetchHtml: async () => html,
  fetchJson: async () => { throw new Error("fetchJson not used in this test"); },
  runYtDlp: async () => { throw new Error("runYtDlp not used in this test"); },
};

describe("phase-1 end-to-end loop", () => {
  it("capture → worker → content ready → second capture is cache hit", async () => {
    const first = await handleCapture(h.pb, userId, "https://example.com/post");
    expect(first.body.cached).toBe(false);

    const job = await claimNextJob(h.pb, "worker-A");
    expect(job).not.toBeNull();

    await processJob(h.pb, job!.id, {
      io,
      registry,
      ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job!.id);
    expect(done.status).toBe("done");

    const second = await handleCapture(h.pb, userId, "https://example.com/post");
    expect(second.body.cached).toBe(true);
  });
});
