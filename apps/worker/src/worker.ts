import { createHash } from "node:crypto";
import type PocketBase from "pocketbase";
import type { ExtractIO } from "./extract/extractor.js";
import type { ExtractorRegistry } from "./extract/registry.js";
import type { AIProvider } from "./ai/provider.js";
import type { SourceType } from "@readmepls/types";
import { deriveSourceHost } from "@readmepls/core";
import { ensureSource } from "./source/ensure-source.js";
import { upsertContent } from "./content/upsert-content.js";
import { indexContent } from "./embed/index-content.js";
import type { EmbeddingProvider } from "./embed/provider.js";

export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
  fetchBytes: (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
  embedder: EmbeddingProvider;
}

export async function processJob(
  pb: PocketBase,
  jobId: string,
  deps: ProcessDeps
): Promise<void> {
  const job = await pb.collection("jobs").getOne(jobId);
  try {
    const source = deps.classify(job.canonical_url);
    const extractor = deps.registry.for(source);
    const result = await extractor.extract(job.canonical_url, deps.io);

    // AI tagging only makes sense for text that was actually extracted —
    // skip the call entirely on a failed extraction (empty contentText).
    const ai =
      result.status === "failed"
        ? { tags: [], summary: "" }
        : await deps.ai.tagAndSummarize(result.contentText);

    // Upsert, not create: a retried job (via /api/retry, which resets a job
    // to queued without touching content) re-runs extraction against a
    // canonical_url that may already have a content row from a prior failed
    // attempt — content.canonical_url has a unique index, so a blind
    // create() would collide. Every outcome (ok/partial/failed) writes the
    // same content row, updated in place on retry.
    const content = await upsertContent(pb, job.canonical_url, {
      content_hash: createHash("sha256").update(result.contentText).digest("hex"),
      source_type: result.sourceType,
      title: result.title,
      author: result.author,
      site_name: result.siteName,
      lang: result.lang,
      excerpt: ai.summary || result.excerpt,
      content_html: result.contentHtml,
      content_text: result.contentText,
      word_count: result.wordCount,
      read_time: result.readTime,
      hero_image: result.heroImage,
      published_at: result.publishedAt,
      ai_tags_json: ai.tags,
      fetched_at: new Date().toISOString(),
      extract_status: result.status,
      failure_reason: result.failureReason,
    });

    // Embed the extracted text for semantic search. Best-effort and keyed to the
    // shared content row: an embedding failure must never fail an otherwise-good
    // extraction, exactly like source linking below.
    if (result.status !== "failed") {
      try {
        await indexContent(pb, content.id, result.contentText, deps.embedder);
      } catch (err) {
        console.error(`[worker] embedding failed for ${job.canonical_url}:`, err);
      }
    }

    // Link the content to its source website. Best-effort: a favicon or source
    // failure must never fail an otherwise-successful extraction job.
    try {
      const host = deriveSourceHost(job.canonical_url);
      if (host) {
        const sourceId = await ensureSource(pb, host, result.siteName, {
          fetchHtml: deps.io.fetchHtml,
          fetchBytes: deps.fetchBytes,
        });
        await pb.collection("content").update(content.id, { source: sourceId });
      }
    } catch (err) {
      console.error(`[worker] source linking failed for ${job.canonical_url}:`, err);
    }

    // Link every content-less article that captured this URL to the
    // (re)written content — including on failure, so a permanently-spinning
    // "processing" card (apps/web/src/lib/article/card-state.ts) can reach
    // "failed" state and offer a retry, instead of spinning forever.
    // is_private only clears on a successful extraction: a failure (e.g. a
    // paywall/login wall) tells us nothing about whether the source is
    // public, so clearing it here would wrongly expose a private capture.
    const toLink = await pb.collection("articles").getFullList({
      filter: pb.filter("canonical_url = {:url} && content = ''", {
        url: job.canonical_url,
      }),
    });
    for (const a of toLink) {
      await pb.collection("articles").update(
        a.id,
        result.status === "failed"
          ? { content: content.id }
          : { content: content.id, is_private: false }
      );
    }

    if (result.status === "failed") {
      await pb.collection("jobs").update(jobId, {
        status: "failed",
        attempts: job.attempts + 1,
        last_error: result.failureReason ?? "extract failed",
        content: content.id,
      });
      return;
    }

    await pb.collection("jobs").update(jobId, {
      status: "done",
      content: content.id,
    });
  } catch (err) {
    // PocketBase validation failures carry field-level detail on
    // err.response.data; err.message alone ("Failed to create record.") hides
    // which field was rejected. Surface the full payload so a stuck job can be
    // diagnosed from last_error without re-running the worker.
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    const detail = data ? ` ${JSON.stringify(data)}` : "";
    const msg = (err instanceof Error ? err.message : String(err)) + detail;
    await pb.collection("jobs").update(jobId, {
      status: "failed",
      attempts: job.attempts + 1,
      last_error: msg,
    });
  }
}
