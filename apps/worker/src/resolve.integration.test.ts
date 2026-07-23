import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  startEphemeralPb,
  makeTestUser,
  type PbHandle,
} from "@readmepls/core/src/pb/test-harness.js";
import { classifySource, handleCapture } from "@readmepls/core";
import { processJob } from "./worker.js";
import { claimNextJob } from "./jobs/claim.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { ExtractorRegistry } from "./extract/registry.js";
import { ResolverRegistry } from "./resolve/registry.js";
import { HackerNewsResolver } from "./resolve/hacker-news-resolver.js";
import { FakeEmbedder } from "./embed/fake-embedder.js";
import type { ExtractIO } from "./extract/extractor.js";
import type { ResolveIO } from "./resolve/resolver.js";

const html = readFileSync(
  fileURLToPath(
    new URL("./extract/fixtures/simple-article.html", import.meta.url),
  ),
  "utf8",
);

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

const registry = new ExtractorRegistry([new ArticleExtractor()]);
const resolvers = new ResolverRegistry([new HackerNewsResolver()]);

/** Serves the article body ONLY for `allowedUrl`; anything else is a failure. */
function ioFor(allowedUrl: string, itemJson: unknown): ExtractIO & ResolveIO {
  return {
    fetchHtml: async (u) => {
      if (u !== allowedUrl) throw new Error(`unexpected fetchHtml for ${u}`);
      return html;
    },
    fetchJson: async () => itemJson,
    fetchRedirectTarget: async () => null,
    runYtDlp: async () => {
      throw new Error("runYtDlp not used in this test");
    },
  };
}

function deps(io: ExtractIO & ResolveIO) {
  return {
    io,
    registry,
    resolvers,
    ai: new MockAIProvider({ tags: ["t"], summary: "s" }),
    classify: classifySource,
    fetchBytes: async () => null,
    embedder: new FakeEmbedder(),
  };
}

describe("aggregator link resolution (integration)", () => {
  it("extracts the resolved target and rewrites the article's canonical_url", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=8863";
    const target = "https://example.com/real-article";
    const userId = await makeTestUser(h.pb);

    // Exactly what handle-capture writes: both fields hold the wrapper URL.
    const article = await h.pb.collection("articles").create({
      user: userId,
      url: wrapper,
      canonical_url: wrapper,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    const job = await h.pb.collection("jobs").create({
      user: userId,
      canonical_url: wrapper,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    // fetchHtml throws for the wrapper, so a pass proves we never extracted the shell.
    await processJob(h.pb, job.id, deps(ioFor(target, { url: target })));

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");

    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.canonical_url).toBe(target);
    expect(content.title).toBe("Hello World Article");

    const after = await h.pb.collection("articles").getOne(article.id);
    expect(after.canonical_url).toBe(target);
    expect(after.url).toBe(wrapper); // provenance preserved
    expect(after.content).toBe(content.id);
  });

  it("leaves canonical_url alone when the host is not an aggregator", async () => {
    const url = "https://example.com/plain-post";
    const userId = await makeTestUser(h.pb);
    const article = await h.pb.collection("articles").create({
      user: userId,
      url,
      canonical_url: url,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    const job = await h.pb.collection("jobs").create({
      user: userId,
      canonical_url: url,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, deps(ioFor(url, null)));

    const after = await h.pb.collection("articles").getOne(article.id);
    expect(after.canonical_url).toBe(url);
  });

  it("keeps both articles when the resolved url collides with an existing one", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=999";
    const target = "https://example.com/collide";
    const userId = await makeTestUser(h.pb);

    // The user already has the original article...
    const existing = await h.pb.collection("articles").create({
      user: userId,
      url: target,
      canonical_url: target,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    // ...and now captures the wrapper pointing at the same thing.
    const viaWrapper = await h.pb.collection("articles").create({
      user: userId,
      url: wrapper,
      canonical_url: wrapper,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    const job = await h.pb.collection("jobs").create({
      user: userId,
      canonical_url: wrapper,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, deps(ioFor(target, { url: target })));

    // Spec rule "allow the duplicate": both rows survive, no merge, no delete.
    const both = await h.pb.collection("articles").getFullList({
      filter: h.pb.filter("canonical_url = {:url}", { url: target }),
    });
    expect(both.map((a) => a.id).sort()).toEqual(
      [existing.id, viaWrapper.id].sort(),
    );
  });

  it("links content.source to the resolved target's host, not the aggregator's", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=42";
    const target = "https://example.com/source-linking-article";
    const userId = await makeTestUser(h.pb);

    await h.pb.collection("articles").create({
      user: userId,
      url: wrapper,
      canonical_url: wrapper,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    const job = await h.pb.collection("jobs").create({
      user: userId,
      canonical_url: wrapper,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, deps(ioFor(target, { url: target })));

    const done = await h.pb.collection("jobs").getOne(job.id);
    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.source).toBeTruthy();

    const source = await h.pb.collection("sources").getOne(content.source);
    expect(source.host).toBe("example.com");
    expect(source.host).not.toBe("news.ycombinator.com");
  });

  // Finding 1: jobs.canonical_url has a global UNIQUE index and no code ever
  // deletes a job row. Once the first capture's job finishes at `wrapper`,
  // a second capture of the same wrapper must not collide with it — that
  // collision is swallowed by handle-capture, silently leaving the new
  // article's `content` empty forever (deriveCardState renders it stuck on
  // "processing" with no retry affordance).
  it("a repeat capture of the same wrapper does not strand the article in content=''", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=555";
    const target = "https://example.com/repeat-capture-article";
    const userId = await makeTestUser(h.pb);
    const io = ioFor(target, { url: target });

    const first = await handleCapture(h.pb, userId, wrapper);
    expect(first.body.cached).toBe(false);

    const jobA = await claimNextJob(h.pb, "worker-A");
    expect(jobA).not.toBeNull();
    await processJob(h.pb, jobA!.id, deps(io));

    const doneA = await h.pb.collection("jobs").getOne(jobA!.id);
    expect(doneA.status).toBe("done");

    // Content now lives under the resolved target, so the cache lookup
    // (keyed by the wrapper) misses and handleCapture enqueues a fresh job.
    const second = await handleCapture(h.pb, userId, wrapper);
    expect(second.body.cached).toBe(false);

    // Without repointing jobA off `wrapper`, this create collides with the
    // unique index, is swallowed by handle-capture, and no job ever exists
    // to fill in second's article.
    const jobB = await claimNextJob(h.pb, "worker-B");
    expect(jobB).not.toBeNull();
    await processJob(h.pb, jobB!.id, deps(io));

    const articleB = await h.pb
      .collection("articles")
      .getOne(second.body.articleId!);
    expect(articleB.content).not.toBe("");
  });

  // Finding 1, scenario A: the repeat-capture test above only proves N=2
  // survives — the one arrangement where the collision-swallowing bug does
  // NOT surface (job A's repoint has nothing to collide with, so it silently
  // stays put at `wrapper`, which happens to still be free for job B). A
  // third capture exposes it: job B's repoint collides with job A (which now
  // occupies the target) and is swallowed, leaving job B stuck at `wrapper`
  // — so capture 3's job create collides with job B and is itself swallowed
  // by handle-capture, stranding article C with content=''.
  it("a third capture of the same wrapper does not strand the article in content=''", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=333";
    const target = "https://example.com/third-capture-article";
    const userId = await makeTestUser(h.pb);
    const io = ioFor(target, { url: target });

    const first = await handleCapture(h.pb, userId, wrapper);
    expect(first.body.cached).toBe(false);
    const jobA = await claimNextJob(h.pb, "worker-A");
    expect(jobA).not.toBeNull();
    await processJob(h.pb, jobA!.id, deps(io));

    const second = await handleCapture(h.pb, userId, wrapper);
    expect(second.body.cached).toBe(false);
    const jobB = await claimNextJob(h.pb, "worker-B");
    expect(jobB).not.toBeNull();
    await processJob(h.pb, jobB!.id, deps(io));

    const third = await handleCapture(h.pb, userId, wrapper);
    expect(third.body.cached).toBe(false);
    const jobC = await claimNextJob(h.pb, "worker-C");
    expect(jobC).not.toBeNull();
    await processJob(h.pb, jobC!.id, deps(io));

    const articleC = await h.pb
      .collection("articles")
      .getOne(third.body.articleId!);
    expect(articleC.content).not.toBe("");
  });

  // Finding 1, scenario B: the more likely real-world ordering — the target
  // article was already captured directly (by this user or another; the
  // jobs.canonical_url unique index is global), so a job already occupies
  // `target` before the wrapper is ever captured. The FIRST wrapper
  // capture's repoint already collides with that pre-existing job, so it
  // only takes two wrapper captures (not three) to strand.
  it("capturing the target directly before the wrapper does not strand the second wrapper capture", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=444";
    const target = "https://example.com/direct-first-article";
    const userId = await makeTestUser(h.pb);
    const io = ioFor(target, { url: target });

    // The target already has a job (and, once processed, content) before any
    // wrapper capture happens.
    const direct = await handleCapture(h.pb, userId, target);
    expect(direct.body.cached).toBe(false);
    const jobDirect = await claimNextJob(h.pb, "worker-direct");
    expect(jobDirect).not.toBeNull();
    await processJob(h.pb, jobDirect!.id, deps(io));

    const first = await handleCapture(h.pb, userId, wrapper);
    expect(first.body.cached).toBe(false);
    const jobA = await claimNextJob(h.pb, "worker-A");
    expect(jobA).not.toBeNull();
    await processJob(h.pb, jobA!.id, deps(io));

    const second = await handleCapture(h.pb, userId, wrapper);
    expect(second.body.cached).toBe(false);
    const jobB = await claimNextJob(h.pb, "worker-B");
    expect(jobB).not.toBeNull();
    await processJob(h.pb, jobB!.id, deps(io));

    const articleB = await h.pb
      .collection("articles")
      .getOne(second.body.articleId!);
    expect(articleB.content).not.toBe("");
  });

  // Finding 2: /api/retry looks up the job by article.canonical_url. The
  // worker rewrites that field to the resolved target on *both* branches
  // (including failure — see worker.ts), so a job that stays keyed to the
  // wrapper is invisible to retry precisely in the case retry exists for: a
  // resolved link whose target extraction failed.
  it("a failed target extraction stays reachable by /api/retry's lookup on article.canonical_url", async () => {
    const wrapper = "https://news.ycombinator.com/item?id=777";
    const target = "https://example.com/will-fail-to-extract";
    const userId = await makeTestUser(h.pb);

    const first = await handleCapture(h.pb, userId, wrapper);
    const jobA = await claimNextJob(h.pb, "worker-A");
    expect(jobA).not.toBeNull();

    // HTML with no readable content: extraction ends in status "failed"
    // rather than throwing, matching a real thin/unparseable page.
    const io: ExtractIO & ResolveIO = {
      fetchHtml: async (u) => {
        if (u !== target) throw new Error(`unexpected fetchHtml for ${u}`);
        return "<html><body></body></html>";
      },
      fetchJson: async () => ({ url: target }),
      fetchRedirectTarget: async () => null,
      runYtDlp: async () => {
        throw new Error("runYtDlp not used in this test");
      },
    };

    await processJob(h.pb, jobA!.id, deps(io));

    const doneA = await h.pb.collection("jobs").getOne(jobA!.id);
    expect(doneA.status).toBe("failed");

    const article = await h.pb
      .collection("articles")
      .getOne(first.body.articleId!);
    expect(article.canonical_url).toBe(target);

    // Reproduces apps/web/src/routes/api/retry/+server.ts's lookup exactly.
    const foundJob = await h.pb
      .collection("jobs")
      .getFirstListItem(
        h.pb.filter("canonical_url = {:url}", { url: article.canonical_url }),
      );
    expect(foundJob.id).toBe(jobA!.id);
  });
});
