import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { runLoopOnce } from "./run-loop.js";
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
import type { ResolveIO } from "./resolve/resolver.js";
import { ResolverRegistry } from "./resolve/registry.js";
import { FakeEmbedder } from "./embed/fake-embedder.js";

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

const io: ExtractIO & ResolveIO = {
  fetchHtml: async () => html,
  fetchJson: async () => { throw new Error("unused"); },
  fetchRedirectTarget: async () => null,
  runYtDlp: async () => { throw new Error("unused"); },
};
const deps = {
  io,
  registry: new ExtractorRegistry([new ArticleExtractor()]),
  resolvers: new ResolverRegistry([]),
  ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
  classify: classifySource,
  fetchBytes: async () => null,
  embedder: new FakeEmbedder(),
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
